import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig, type WorkspaceConfig } from "@palmtty/config";
import { SessionManager } from "./session-manager.js";
import { SessionWorkerServer } from "./session-worker.js";
import type { PtyFactory, PtyHandle } from "./session-runtime.js";
import { WorkerClient } from "./worker-client.js";
import type { WorkerBootstrap } from "./worker-protocol.js";
import {
  ensureRuntimeLayout,
  readWorkerRecord,
  readWorkerSecret,
  workerRecordPath,
  workerSecretPath,
  writeWorkerRecord,
  writeWorkerSecret
} from "./worker-storage.js";

const runtimeDirs = new Set<string>();
const servers = new Set<SessionWorkerServer>();

afterEach(async () => {
  for (const server of servers) {
    await server.shutdown({ killPty: true, cleanupState: true }).catch(() => undefined);
  }
  servers.clear();

  for (const runtimeDir of runtimeDirs) {
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);
  }
  runtimeDirs.clear();
});

class SilentPty implements PtyHandle {
  readonly pid = 55_555;
  write(): void {}
  resize(): void {}
  kill(): void {
    for (const listener of [...this.exitListeners]) listener({ exitCode: 0 });
  }

  private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();

  onData(): { dispose(): void } {
    return { dispose() {} };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void } {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }
}

const silentPtyFactory: PtyFactory = () => new SilentPty();

function workspace(): WorkspaceConfig {
  return {
    id: "security",
    name: "Security",
    cwd: process.cwd(),
    shell: "custom",
    shellPath: "unused-test-shell",
    args: [],
    env: {}
  };
}

function bootstrap(runtimeDir: string): WorkerBootstrap {
  return {
    protocol: 1,
    runtimeDir,
    sessionId: "security-session-00000001",
    endpointId: "security-endpoint-0000001",
    secret: "correct-session-secret-0123456789abcdef",
    excludedEnvKeys: ["PALMTTY_TEST_ACCESS_TOKEN"],
    createdAt: new Date().toISOString(),
    workspace: workspace(),
    session: {
      exitedRetentionMinutes: 30,
      scrollbackLines: 1_000,
      replayBytes: 65_536
    },
    cols: 80,
    rows: 24
  };
}

describe("session worker security boundary", () => {
  it("rejects a controller with the wrong per-session secret", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-worker-auth-"));
    runtimeDirs.add(runtimeDir);

    const config = bootstrap(runtimeDir);
    const server = new SessionWorkerServer(config, {
      ptyFactory: silentPtyFactory
    });
    servers.add(server);
    await server.start();

    await expect(WorkerClient.connect({
      runtimeDir,
      endpointId: config.endpointId,
      secret: "wrong-session-secret-0123456789abcdef"
    })).rejects.toThrow();

    const authenticated = await WorkerClient.connect({
      runtimeDir,
      endpointId: config.endpointId,
      secret: config.secret
    });
    expect(authenticated.session).toMatchObject({
      id: config.sessionId,
      workspaceId: config.workspace.id,
      state: "running"
    });
    authenticated.close();
  });

  it("removes stale recovery metadata without treating the recorded PID as kill authority", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-worker-stale-"));
    runtimeDirs.add(runtimeDir);
    await ensureRuntimeLayout(runtimeDir);

    const sessionId = "stale-session-0000000001";
    const endpointId = "stale-endpoint-000000001";
    await writeWorkerSecret(
      runtimeDir,
      sessionId,
      "stale-session-secret-0123456789abcdef"
    );
    await writeWorkerRecord(runtimeDir, {
      version: 1,
      sessionId,
      workspaceId: "security",
      createdAt: new Date().toISOString(),
      endpointId,
      workerPid: process.pid,
      shellPid: process.pid
    });

    const config = parseConfig({
      server: { host: "127.0.0.1", port: 7688 },
      auth: { enabled: false },
      workspaces: [workspace()]
    });

    const manager = new SessionManager(config, { runtimeDir });
    await manager.initialize();

    expect(manager.list()).toEqual([]);
    await expect(readWorkerRecord(runtimeDir, sessionId)).rejects.toThrow();
    await expect(readWorkerSecret(runtimeDir, sessionId)).rejects.toThrow();
    expect(workerRecordPath(runtimeDir, sessionId)).not.toBe("");
    expect(workerSecretPath(runtimeDir, sessionId)).not.toBe("");

    await manager.close();
  }, 8_000);
});
