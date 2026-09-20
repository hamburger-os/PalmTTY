import { mkdtemp, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig, type WorkspaceConfig } from "@palmtty/config";
import type { RuntimeWorkspace } from "./workspace-runtime.js";
import { SessionManager } from "./session-manager.js";
import { SessionWorkerServer } from "./session-worker.js";
import type { PtyFactory, PtyHandle } from "./session-runtime.js";
import { WorkerClient } from "./worker-client.js";
import { WorkerRequestSchema, type WorkerBootstrap } from "./worker-protocol.js";
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
    shellPath: process.execPath,
    args: [],
    env: {}
  };
}

function runtimeWorkspace(): RuntimeWorkspace {
  return {
    id: "security",
    cwd: process.cwd(),
    executable: process.execPath,
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
    workspace: runtimeWorkspace(),
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
  it("rejects terminal input larger than the browser protocol limit", () => {
    const parsed = WorkerRequestSchema.safeParse({
      type: "input",
      requestId: "request-1",
      data: "A".repeat(64 * 1024 + 1)
    });
    expect(parsed.success).toBe(false);
  });


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

  it("preserves recovery metadata when connection failure does not prove the Worker is dead", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-worker-stale-"));
    runtimeDirs.add(runtimeDir);
    await ensureRuntimeLayout(runtimeDir);

    const sessionId = "stale-session-0000000001";
    const endpointId = "stale-endpoint-000000001";
    const secret = "stale-session-secret-0123456789abcdef";
    await writeWorkerSecret(runtimeDir, sessionId, secret);
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
    await expect(readWorkerRecord(runtimeDir, sessionId)).resolves.toMatchObject({
      sessionId,
      endpointId,
      workerPid: process.pid
    });
    await expect(readWorkerSecret(runtimeDir, sessionId)).resolves.toBe(secret);

    await manager.close();
  }, 12_000);

  it("republishes missing Worker-owned recovery artifacts", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-worker-heal-"));
    runtimeDirs.add(runtimeDir);

    const config = bootstrap(runtimeDir);
    const server = new SessionWorkerServer(config, {
      ptyFactory: silentPtyFactory,
      stateWatchdogIntervalMs: 20,
      stateWatchdogFailures: 1
    });
    servers.add(server);
    await server.start();

    await Promise.all([
      unlink(workerRecordPath(runtimeDir, config.sessionId)),
      unlink(workerSecretPath(runtimeDir, config.sessionId))
    ]);

    const deadline = Date.now() + 1_000;
    for (;;) {
      try {
        const [record, secret] = await Promise.all([
          readWorkerRecord(runtimeDir, config.sessionId),
          readWorkerSecret(runtimeDir, config.sessionId)
        ]);
        expect(record).toMatchObject({
          sessionId: config.sessionId,
          endpointId: config.endpointId,
          workerPid: process.pid
        });
        expect(secret).toBe(config.secret);
        break;
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  });
});
