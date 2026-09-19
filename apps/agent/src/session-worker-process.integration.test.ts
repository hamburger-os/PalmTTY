import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import {
  ServerMessageSchema,
  type ServerMessage
} from "@palmtty/protocol";
import type WebSocket from "ws";
import { SessionManager } from "./session-manager.js";

class FakeSocket {
  readyState = 1;
  bufferedAmount = 0;
  readonly messages: ServerMessage[] = [];
  closeCode: number | undefined;
  closeReason: string | undefined;

  send(data: string): void {
    this.messages.push(ServerMessageSchema.parse(JSON.parse(data)));
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closeCode = code;
    this.closeReason = reason;
  }
}

const runtimeDirs = new Set<string>();
const managers = new Set<SessionManager>();

afterEach(async () => {
  for (const manager of managers) {
    await manager.close().catch(() => undefined);
  }
  managers.clear();
  for (const runtimeDir of runtimeDirs) {
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);
  }
  runtimeDirs.clear();
});

function testConfig() {
  const workspace = process.platform === "win32"
    ? {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        shell: "pwsh" as const,
        args: ["-NoLogo", "-NoProfile"]
      }
    : {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        shell: "custom" as const,
        shellPath: "/bin/sh",
        args: ["-i"]
      };

  const config = parseConfig({
    server: { host: "127.0.0.1", port: 7688 },
    auth: { enabled: false },
    workspaces: [workspace]
  });
  // Test-only short retention; the public config intentionally requires >= 1 minute.
  config.sessions.exitedRetentionMinutes = 0.01;
  return config;
}

function maxSeq(messages: ServerMessage[]): number {
  let value = 0;
  for (const message of messages) {
    if (message.type === "hello") value = Math.max(value, message.latestSeq);
    if (message.type === "output" || message.type === "snapshot") {
      value = Math.max(value, message.seq);
    }
  }
  return value;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 8_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for worker process condition");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("detached session worker process", () => {
  it("survives Agent teardown and is rediscovered with replay intact", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-worker-process-"));
    runtimeDirs.add(runtimeDir);
    const config = testConfig();

    const firstManager = new SessionManager(config, { runtimeDir });
    managers.add(firstManager);
    await firstManager.initialize();

    const session = await firstManager.create("process", 80, 24);
    expect(session.pid).toBeTypeOf("number");

    const firstSocket = new FakeSocket();
    await firstManager.attach(
      session.id,
      firstSocket as unknown as WebSocket,
      0
    );
    const resumeFrom = maxSeq(firstSocket.messages);

    const delayedOutputCommand = process.platform === "win32"
      ? 'Start-Sleep -Milliseconds 700; Write-Output "WORKER_SURVIVED"\r'
      : "sleep 0.7; printf 'WORKER_SURVIVED\\n'\n";
    await firstManager.write(session.id, delayedOutputCommand);

    await firstManager.close();
    managers.delete(firstManager);

    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const secondManager = new SessionManager(config, { runtimeDir });
    managers.add(secondManager);
    await secondManager.initialize();

    const recovered = secondManager.get(session.id);
    expect(recovered).toMatchObject({
      id: session.id,
      pid: session.pid,
      state: "running"
    });

    const secondSocket = new FakeSocket();
    await secondManager.attach(
      session.id,
      secondSocket as unknown as WebSocket,
      resumeFrom
    );

    await waitFor(() =>
      secondSocket.messages.some(
        (message) =>
          message.type === "output" &&
          message.data.includes("WORKER_SURVIVED")
      )
    );

    expect(secondSocket.messages.some(
      (message) =>
        message.type === "output" &&
        message.data.includes("WORKER_SURVIVED")
    )).toBe(true);

    await secondManager.terminate(session.id);
    await waitFor(() =>
      secondSocket.messages.some((message) => message.type === "exit")
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, 20_000);
});
