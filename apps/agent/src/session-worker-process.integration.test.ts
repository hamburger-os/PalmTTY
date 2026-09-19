import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import {
  ServerMessageSchema,
  SessionPublicSchema,
  type ServerMessage,
  type SessionPublic
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
  config.sessions.exitedRetentionMinutes = 0.01;
  return config;
}

async function createFromAgentProcess(runtimeDir: string): Promise<SessionPublic> {
  const fixture = fileURLToPath(new URL("./session-worker-parent.fixture.ts", import.meta.url));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", fixture, runtimeDir],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`Agent parent fixture failed (${exitCode}): ${stderr}`);
  }

  const line = stdout.trim().split(/\r?\n/).at(-1);
  if (!line) throw new Error("Agent parent fixture did not return a session");
  return SessionPublicSchema.parse(JSON.parse(line));
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
  it("survives the creator Agent process exit and preserves replay across another restart", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-worker-process-"));
    runtimeDirs.add(runtimeDir);
    const config = testConfig();

    // This subprocess creates the Worker and then exits completely. The Worker
    // must remain alive as a detached grandchild before this process reconnects.
    const session = await createFromAgentProcess(runtimeDir);
    expect(session.pid).toBeTypeOf("number");

    const secondManager = new SessionManager(config, { runtimeDir });
    managers.add(secondManager);
    await secondManager.initialize();

    expect(secondManager.get(session.id)).toMatchObject({
      id: session.id,
      pid: session.pid,
      state: "running"
    });

    const secondSocket = new FakeSocket();
    await secondManager.attach(
      session.id,
      secondSocket as unknown as WebSocket,
      0
    );
    const resumeFrom = maxSeq(secondSocket.messages);

    const delayedOutputCommand = process.platform === "win32"
      ? 'Start-Sleep -Milliseconds 700; Write-Output "WORKER_SURVIVED"\r'
      : "sleep 0.7; printf 'WORKER_SURVIVED\\n'\n";
    await secondManager.write(session.id, delayedOutputCommand);

    await secondManager.close();
    managers.delete(secondManager);
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const thirdManager = new SessionManager(config, { runtimeDir });
    managers.add(thirdManager);
    await thirdManager.initialize();

    expect(thirdManager.get(session.id)).toMatchObject({
      id: session.id,
      pid: session.pid,
      state: "running"
    });

    const thirdSocket = new FakeSocket();
    await thirdManager.attach(
      session.id,
      thirdSocket as unknown as WebSocket,
      resumeFrom
    );

    await waitFor(() =>
      thirdSocket.messages.some(
        (message) =>
          message.type === "output" &&
          message.data.includes("WORKER_SURVIVED")
      )
    );

    await thirdManager.terminate(session.id);
    await waitFor(() =>
      thirdSocket.messages.some((message) => message.type === "exit")
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, 25_000);
});
