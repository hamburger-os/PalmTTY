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
  type SessionPublic,
  type WorkspaceDefinition
} from "@palmtty/protocol";
import type WebSocket from "ws";
import { SessionManager } from "./session-manager.js";
import { resolveExecutable } from "./workspace-runtime.js";
import { MemoryWorkspaceStore } from "./workspace-store.js";

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

async function resolveWindowsTestShell(): Promise<string> {
  const failures: string[] = [];
  for (const candidate of ["pwsh.exe", "powershell.exe"]) {
    try {
      return await resolveExecutable(candidate, { cwd: process.cwd() });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(
    "Detached Worker integration test requires PowerShell 7 or Windows PowerShell. " +
    failures.join(" ")
  );
}

function requiredWindowsShellPath(shellPath?: string): string {
  if (!shellPath) throw new Error("Windows shell path is required");
  return shellPath;
}

function processWorkspace(windowsShellPath?: string): WorkspaceDefinition {
  return process.platform === "win32"
    ? {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        runtime: {
          kind: "host",
          shell: requiredWindowsShellPath(windowsShellPath),
          args: ["-NoLogo", "-NoProfile"]
        }
      }
    : {
        id: "process",
        name: "Process worker",
        cwd: process.cwd(),
        runtime: {
          kind: "host",
          shell: "/bin/sh",
          args: ["-i"]
        }
      };
}

function testConfig() {
  const config = parseConfig({
    server: { host: "127.0.0.1", port: 7688 },
    auth: { enabled: false }
  });
  config.sessions.exitedRetentionMinutes = 0.01;
  return config;
}

async function createFromAgentProcess(
  runtimeDir: string,
  windowsShellPath?: string
): Promise<SessionPublic> {
  const fixture = fileURLToPath(new URL("./session-worker-parent.fixture.ts", import.meta.url));
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fixture,
      runtimeDir,
      ...(windowsShellPath ? [windowsShellPath] : [])
    ],
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
    const windowsShellPath = process.platform === "win32"
      ? await resolveWindowsTestShell()
      : undefined;
    const config = testConfig();
    const workspace = processWorkspace(windowsShellPath);

    // This subprocess creates the Worker and then exits completely. The Worker
    // must remain alive as a detached grandchild before this process reconnects.
    const session = await createFromAgentProcess(runtimeDir, windowsShellPath);
    expect(session.pid).toBeTypeOf("number");

    const secondManager = new SessionManager(config, {
      runtimeDir,
      workspaceStore: new MemoryWorkspaceStore([workspace])
    });
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
      0,
      80,
      24
    );
    const resumeFrom = maxSeq(secondSocket.messages);

    const delayedOutputCommand = process.platform === "win32"
      ? 'Start-Sleep -Milliseconds 700; Write-Output "WORKER_SURVIVED"\r'
      : "sleep 0.7; printf 'WORKER_SURVIVED\\n'\n";
    await secondManager.write(session.id, delayedOutputCommand);

    await secondManager.close();
    managers.delete(secondManager);
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const thirdManager = new SessionManager(config, {
      runtimeDir,
      workspaceStore: new MemoryWorkspaceStore([workspace])
    });
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
      resumeFrom,
      80,
      24
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
