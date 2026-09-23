import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import type { SessionPublic } from "@palmtty/protocol";
import { buildApp } from "./app.js";
import { SessionWorkerServer } from "./session-worker.js";
import type { PtyFactory, PtyHandle } from "./session-runtime.js";
import type { WorkerBootstrap } from "./worker-protocol.js";
import type { WorkerSpawner } from "./worker-spawner.js";
import {
  readWorkerRecord,
  readWorkerSecret
} from "./worker-storage.js";
import { MemoryWorkspaceStore } from "./workspace-store.js";

const ORIGIN = "http://127.0.0.1:7688";

function png(width = 32, height = 24): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ]).copy(buffer);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

class ControlledPty implements PtyHandle {
  readonly pid = 61_001;
  private readonly exitListeners = new Set<
    (event: { exitCode: number; signal?: number }) => void
  >();
  killCount = 0;
  private exited = false;

  write(): void {}
  resize(): void {}
  onData(): { dispose(): void } {
    return { dispose() {} };
  }

  kill(): void {
    if (this.exited) return;
    this.killCount += 1;
  }

  onExit(
    listener: (event: { exitCode: number; signal?: number }) => void
  ): { dispose(): void } {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  emitExit(exitCode = 0): void {
    if (this.exited) return;
    this.exited = true;
    for (const listener of [...this.exitListeners]) listener({ exitCode });
  }
}

class EmbeddedWorkerSpawner implements WorkerSpawner {
  readonly ptys: ControlledPty[] = [];
  private readonly servers: SessionWorkerServer[] = [];
  readonly factory: PtyFactory = () => {
    const pty = new ControlledPty();
    this.ptys.push(pty);
    return pty;
  };

  get pty(): ControlledPty {
    const pty = this.ptys[0];
    if (!pty) throw new Error("PTY has not been created");
    return pty;
  }

  async spawn(bootstrap: WorkerBootstrap): Promise<void> {
    const server = new SessionWorkerServer(bootstrap, {
      ptyFactory: this.factory
    });
    await server.start();
    this.servers.push(server);
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.servers.map((server) =>
      server.shutdown({ killPty: true, cleanupState: true })
    ));
    this.servers.length = 0;
  }
}

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const spawners = new Set<EmbeddedWorkerSpawner>();
const runtimeDirs = new Set<string>();

afterEach(async () => {
  for (const app of apps) {
    await app.close().catch(() => undefined);
  }
  apps.clear();

  for (const spawner of spawners) {
    await spawner.closeAll().catch(() => undefined);
  }
  spawners.clear();

  for (const runtimeDir of runtimeDirs) {
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);
  }
  runtimeDirs.clear();
});

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 2_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for session state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function buildHarness() {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-lifecycle-"));
  runtimeDirs.add(runtimeDir);

  const spawner = new EmbeddedWorkerSpawner();
  spawners.add(spawner);

  const config = parseConfig({
    server: {
      port: 7688,
      exposure: { mode: "local" }
    },
    auth: { enabled: false }
  });
  config.sessions.maxSessions = 1;

  const workspaceStore = new MemoryWorkspaceStore([{
    id: "lifecycle",
    name: "Lifecycle",
    cwd: process.cwd(),
    runtime: {
      kind: "host",
      shell: process.execPath,
      args: []
    }
  }]);
  const app = await buildApp(config, {
    sessionManager: { runtimeDir, workerSpawner: spawner },
    workspaceStore
  });
  apps.add(app);

  return { app, spawner, runtimeDir, workspaceStore };
}

describe("session lifecycle API", () => {
  it("separates termination from retained-session removal", async () => {
    const { app, spawner, runtimeDir } = await buildHarness();

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { origin: ORIGIN },
      payload: { workspaceId: "lifecycle", cols: 80, rows: 24 }
    });
    expect(created.statusCode).toBe(201);
    const session = created.json().session as SessionPublic;
    expect((await readWorkerRecord(runtimeDir, session.id)).launchRuntime)
      .toEqual({ kind: "host" });

    const uploaded = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${session.id}/artifacts/upload`,
      headers: {
        origin: ORIGIN,
        "content-type": "application/octet-stream",
        "x-palmtty-filename": encodeURIComponent("screen shot.png")
      },
      payload: png()
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().artifact).toMatchObject({
      name: "screen shot.png",
      mime: "image/png",
      width: 32,
      height: 24
    });
    const artifactId = uploaded.json().artifact.id as string;

    const listed = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${session.id}/artifacts/list`,
      headers: { origin: ORIGIN },
      payload: {}
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().artifacts).toHaveLength(1);

    const content = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${session.id}/artifacts/${artifactId}/content`,
      headers: { origin: ORIGIN },
      payload: {}
    });
    expect(content.statusCode).toBe(200);
    expect(content.headers["content-type"]).toContain("image/png");
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
    expect(content.rawPayload).toEqual(png());

    const prematureClear = await app.inject({
      method: "DELETE",
      url: `/api/v1/sessions/${session.id}`,
      headers: { origin: ORIGIN }
    });
    expect(prematureClear.statusCode).toBe(409);
    expect(prematureClear.json()).toEqual({ error: "session_not_stopped" });

    const rejectedOrigin = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${session.id}/terminate`,
      headers: { origin: "https://evil.invalid" }
    });
    expect(rejectedOrigin.statusCode).toBe(403);
    expect(spawner.pty.killCount).toBe(0);

    const terminated = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${session.id}/terminate`,
      headers: { origin: ORIGIN }
    });
    expect(terminated.statusCode).toBe(202);
    expect(terminated.json().session).toMatchObject({
      id: session.id,
      state: "stopping"
    });
    expect(spawner.pty.killCount).toBe(1);

    const duplicateTerminate = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${session.id}/terminate`,
      headers: { origin: ORIGIN }
    });
    expect(duplicateTerminate.statusCode).toBe(202);
    expect(duplicateTerminate.json().session.state).toBe("stopping");
    expect(spawner.pty.killCount).toBe(1);

    const clearWhileStopping = await app.inject({
      method: "DELETE",
      url: `/api/v1/sessions/${session.id}`,
      headers: { origin: ORIGIN }
    });
    expect(clearWhileStopping.statusCode).toBe(409);

    const deleteWorkspaceWhileStopping = await app.inject({
      method: "DELETE",
      url: "/api/v1/workspaces/lifecycle",
      headers: { origin: ORIGIN }
    });
    expect(deleteWorkspaceWhileStopping.statusCode).toBe(409);
    expect(deleteWorkspaceWhileStopping.json()).toEqual({
      error: "workspace_in_use"
    });

    const secondWhileStopping = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { origin: ORIGIN },
      payload: { workspaceId: "lifecycle", cols: 80, rows: 24 }
    });
    expect(secondWhileStopping.statusCode).toBe(409);

    spawner.pty.emitExit(0);
    await waitUntil(async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/sessions/${session.id}`
      });
      return response.statusCode === 200 &&
        response.json().session.state === "exited";
    });

    const cleared = await app.inject({
      method: "DELETE",
      url: `/api/v1/sessions/${session.id}`,
      headers: { origin: ORIGIN }
    });
    expect(cleared.statusCode).toBe(204);

    const gone = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${session.id}`
    });
    expect(gone.statusCode).toBe(404);

    await waitUntil(async () => {
      const [record, secret] = await Promise.allSettled([
        readWorkerRecord(runtimeDir, session.id),
        readWorkerSecret(runtimeDir, session.id)
      ]);
      return record.status === "rejected" && secret.status === "rejected";
    });

    await expect(access(
      path.join(runtimeDir, "artifacts-v1", session.id)
    )).rejects.toThrow();
  });

  it("validates the replacement before terminating the current PTY", async () => {
    const { app, spawner, workspaceStore } = await buildHarness();

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { origin: ORIGIN },
      payload: { workspaceId: "lifecycle", cols: 80, rows: 24 }
    });
    expect(created.statusCode).toBe(201);
    const original = created.json().session as SessionPublic;

    await workspaceStore.replace("lifecycle", {
      id: "lifecycle",
      name: "Lifecycle",
      cwd: process.cwd(),
      runtime: {
        kind: "host",
        shell: "definitely-not-a-real-palmtty-shell",
        args: []
      }
    });

    const restarted = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${original.id}/restart`,
      headers: { origin: ORIGIN }
    });
    expect(restarted.statusCode).toBe(409);
    expect(spawner.pty.killCount).toBe(0);

    const stillRunning = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${original.id}`
    });
    expect(stillRunning.statusCode).toBe(200);
    expect(stillRunning.json().session.state).toBe("running");
  });

  it("restarts by replacing the PTY with a new session", async () => {
    const { app, spawner } = await buildHarness();

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      headers: { origin: ORIGIN },
      payload: { workspaceId: "lifecycle", cols: 100, rows: 31 }
    });
    expect(created.statusCode).toBe(201);
    const original = created.json().session as SessionPublic;

    const restarting = app.inject({
      method: "POST",
      url: `/api/v1/sessions/${original.id}/restart`,
      headers: { origin: ORIGIN }
    });

    await waitUntil(() => spawner.pty.killCount === 1);
    spawner.pty.emitExit(0);

    const restarted = await restarting;
    expect(restarted.statusCode).toBe(201);
    const replacement = restarted.json().session as SessionPublic;
    expect(replacement.id).not.toBe(original.id);
    expect(replacement).toMatchObject({
      workspaceId: "lifecycle",
      state: "running",
      cols: 100,
      rows: 31
    });
    expect(spawner.ptys).toHaveLength(2);

    const oldSession = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${original.id}`
    });
    expect(oldSession.statusCode).toBe(404);
  });
});
