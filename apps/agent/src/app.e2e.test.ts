import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig, type PalmTTYConfig } from "@palmtty/config";
import {
  ServerMessageSchema,
  WS_SUBPROTOCOL,
  type ServerMessage,
  type SessionPublic
} from "@palmtty/protocol";
import WebSocket from "ws";
import { buildApp } from "./app.js";
import { SessionWorkerServer } from "./session-worker.js";
import type { PtyFactory, PtyHandle } from "./session-runtime.js";
import type { WorkerBootstrap } from "./worker-protocol.js";
import type { SpawnedWorker, WorkerSpawner } from "./worker-spawner.js";

const TOKEN_ENV = "PALMTTY_E2E_TOKEN";
const TOKEN = "0123456789abcdef0123456789abcdef";

class DeterministicPty implements PtyHandle {
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();
  private exited = false;
  readonly events: Array<
    | { type: "write"; data: string }
    | { type: "resize"; cols: number; rows: number }
    | { type: "kill" }
  > = [];

  constructor(readonly pid: number) {}

  onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListeners.add(listener);
    return { dispose: () => { this.dataListeners.delete(listener); } };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void } {
    this.exitListeners.add(listener);
    return { dispose: () => { this.exitListeners.delete(listener); } };
  }

  write(data: string): void {
    if (this.exited) return;
    this.events.push({ type: "write", data });
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return;
    this.events.push({ type: "resize", cols, rows });
  }

  kill(_signal?: string): void {
    this.events.push({ type: "kill" });
    this.emitExit(0);
  }

  emitData(data: string): void {
    if (this.exited) return;
    for (const listener of [...this.dataListeners]) listener(data);
  }

  emitExit(exitCode: number): void {
    if (this.exited) return;
    this.exited = true;
    for (const listener of [...this.exitListeners]) listener({ exitCode });
  }
}

type PtyHarness = {
  factory: PtyFactory;
  latest(): DeterministicPty;
};

function createPtyHarness(): PtyHarness {
  let nextPid = 40_000;
  const created: DeterministicPty[] = [];
  return {
    factory: () => {
      const instance = new DeterministicPty(nextPid++);
      created.push(instance);
      return instance;
    },
    latest: () => {
      const instance = created.at(-1);
      if (!instance) throw new Error("No deterministic PTY has been created");
      return instance;
    }
  };
}

class EmbeddedWorkerSpawner implements WorkerSpawner {
  private readonly servers: SessionWorkerServer[] = [];

  constructor(readonly pty: PtyHarness) {}

  async spawn(bootstrap: WorkerBootstrap): Promise<SpawnedWorker> {
    const server = new SessionWorkerServer(bootstrap, {
      ptyFactory: this.pty.factory
    });
    await server.start();
    this.servers.push(server);
    return {
      release() {},
      abort: async () => {
        await server.shutdown({ killPty: true, cleanupState: true });
      }
    };
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.servers.map((server) =>
      server.shutdown({ killPty: true, cleanupState: true })
    ));
    this.servers.length = 0;
  }
}

type AppInstance = Awaited<ReturnType<typeof buildApp>>;

type Harness = {
  app: AppInstance;
  config: PalmTTYConfig;
  origin: string;
  wsBase: string;
  pty: PtyHarness;
  runtimeDir: string;
  workerSpawner: EmbeddedWorkerSpawner;
};

const liveApps = new Set<AppInstance>();
const liveSpawners = new Set<EmbeddedWorkerSpawner>();
const liveRuntimeDirs = new Set<string>();

afterEach(async () => {
  for (const app of liveApps) {
    try {
      await app.close();
    } catch {
      // Best-effort cleanup for a test that already closed its server.
    }
  }
  liveApps.clear();

  for (const spawner of liveSpawners) {
    await spawner.closeAll().catch(() => undefined);
  }
  liveSpawners.clear();

  for (const runtimeDir of liveRuntimeDirs) {
    await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);
  }
  liveRuntimeDirs.clear();
  delete process.env[TOKEN_ENV];
});

async function startHarness(
  mutate?: (config: PalmTTYConfig) => void
): Promise<Harness> {
  process.env[TOKEN_ENV] = TOKEN;
  const config = parseConfig({
    server: {
      host: "127.0.0.1",
      port: 7688,
      trustedOrigins: ["http://127.0.0.1:7688"],
      secureCookies: false
    },
    auth: {
      enabled: true,
      tokenEnv: TOKEN_ENV,
      sessionTtlMinutes: 5
    },
    workspaces: [{
      id: "e2e",
      name: "E2E",
      cwd: process.cwd(),
      shell: "custom",
      shellPath: process.execPath,
      args: []
    }]
  });
  mutate?.(config);

  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-e2e-"));
  liveRuntimeDirs.add(runtimeDir);
  const pty = createPtyHarness();
  const workerSpawner = new EmbeddedWorkerSpawner(pty);
  liveSpawners.add(workerSpawner);
  const app = await buildApp(config, {
    sessionManager: { runtimeDir, workerSpawner }
  });
  liveApps.add(app);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const origin = new URL(address).origin;

  // Test-only ephemeral listener: keep the runtime Origin policy exact.
  config.server.port = Number(new URL(origin).port);
  config.server.trustedOrigins = [origin];

  return {
    app,
    config,
    origin,
    wsBase: origin.replace(/^http/, "ws"),
    pty,
    runtimeDir,
    workerSpawner
  };
}

async function login(harness: Harness): Promise<string> {
  const response = await fetch(`${harness.origin}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: harness.origin
    },
    body: JSON.stringify({ token: TOKEN })
  });
  expect(response.status).toBe(204);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0]!;
}

async function createSession(harness: Harness, cookie: string): Promise<SessionPublic> {
  const response = await fetch(`${harness.origin}/api/v1/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      origin: harness.origin
    },
    body: JSON.stringify({ workspaceId: "e2e", cols: 80, rows: 24 })
  });
  expect(response.status).toBe(201);
  const body = await response.json() as { session: SessionPublic };
  return body.session;
}

async function getSession(
  harness: Harness,
  cookie: string,
  sessionId: string
): Promise<Response> {
  return fetch(`${harness.origin}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { cookie }
  });
}

function socketFor(
  harness: Harness,
  sessionId: string,
  cookie: string | undefined,
  origin = harness.origin,
  protocol = WS_SUBPROTOCOL
): WebSocket {
  const headers: Record<string, string> = { Origin: origin };
  if (cookie) headers.Cookie = cookie;
  return new WebSocket(
    `${harness.wsBase}/api/v1/sessions/${encodeURIComponent(sessionId)}/terminal`,
    protocol,
    { headers }
  );
}

function waitForOpen(socket: WebSocket, timeoutMs = 3_000): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timed out")), timeoutMs);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForClose(
  socket: WebSocket,
  timeoutMs = 5_000
): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket close timed out")), timeoutMs);
    socket.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
  });
}

async function rejectedUpgradeStatus(
  harness: Harness,
  sessionId: string,
  cookie: string | undefined,
  origin: string
): Promise<number> {
  const socket = socketFor(harness, sessionId, cookie, origin);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error("Expected WebSocket upgrade rejection"));
    }, 3_000);
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      const status = response.statusCode ?? 0;
      response.resume();
      resolve(status);
    });
    socket.once("open", () => {
      clearTimeout(timer);
      socket.terminate();
      reject(new Error("WebSocket unexpectedly upgraded"));
    });
    socket.on("error", () => {
      // Expected after some rejected upgrade paths; the HTTP status is authoritative.
    });
  });
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 3_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

class MessageInbox {
  private readonly messages: ServerMessage[] = [];
  private readonly waiters = new Set<() => void>();
  transcript = "";
  latestSeq = 0;

  constructor(socket: WebSocket) {
    socket.on("message", (raw, isBinary) => {
      if (isBinary) return;
      const message = ServerMessageSchema.parse(JSON.parse(raw.toString()));
      this.messages.push(message);
      if (message.type === "snapshot" || message.type === "output") {
        this.transcript += message.data;
        this.latestSeq = message.seq;
      }
      for (const wake of [...this.waiters]) wake();
    });
  }

  async next(
    predicate: (message: ServerMessage) => boolean,
    timeoutMs = 5_000
  ): Promise<ServerMessage> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0]!;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Timed out waiting for server message");
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          clearTimeout(timer);
          this.waiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(() => {
          this.waiters.delete(wake);
          reject(new Error("Timed out waiting for server message"));
        }, remaining);
        this.waiters.add(wake);
      });
    }
  }

  async waitForText(marker: string, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.transcript.includes(marker)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Timed out waiting for terminal text: ${marker}`);
      try {
        await this.next(() => true, remaining);
      } catch {
        throw new Error(`Timed out waiting for terminal text: ${marker}`);
      }
    }
  }
}

describe("terminal WebSocket integration", () => {
  it("enforces maxSessions across concurrent creates", async () => {
    const harness = await startHarness((config) => {
      config.sessions.maxSessions = 1;
    });
    const cookie = await login(harness);

    const create = () => fetch(`${harness.origin}/api/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        origin: harness.origin
      },
      body: JSON.stringify({ workspaceId: "e2e", cols: 80, rows: 24 })
    });

    const responses = await Promise.all([create(), create()]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

    const listed = await fetch(`${harness.origin}/api/v1/sessions`, {
      headers: { cookie }
    });
    const body = await listed.json() as { sessions: SessionPublic[] };
    expect(body.sessions).toHaveLength(1);
  });


  it("enforces authentication, exact Origin, and the PalmTTY subprotocol independently", async () => {
    const harness = await startHarness();
    const cookie = await login(harness);
    const session = await createSession(harness, cookie);

    expect(await rejectedUpgradeStatus(
      harness,
      session.id,
      undefined,
      harness.origin
    )).toBe(401);

    expect(await rejectedUpgradeStatus(
      harness,
      session.id,
      cookie,
      "https://evil.invalid"
    )).toBe(403);

    const wrongProtocol = socketFor(
      harness,
      session.id,
      cookie,
      harness.origin,
      "not-palmtty"
    );
    const closed = waitForClose(wrongProtocol);
    await waitForOpen(wrongProtocol);
    await expect(closed).resolves.toMatchObject({
      code: 1002,
      reason: "Unsupported PalmTTY protocol"
    });
  });

  it("requires resume before input and resize", async () => {
    const harness = await startHarness();
    const cookie = await login(harness);
    const session = await createSession(harness, cookie);
    const socket = socketFor(harness, session.id, cookie);
    const closed = waitForClose(socket);
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: "input", data: "blocked" }));

    await expect(closed).resolves.toMatchObject({
      code: 1008,
      reason: "Resume handshake required"
    });
    expect(harness.pty.latest().events).toEqual([]);
  });

  it("serializes resume, resize, and input frames in connection order", async () => {
    const harness = await startHarness();
    const cookie = await login(harness);
    const session = await createSession(harness, cookie);
    const socket = socketFor(harness, session.id, cookie);
    const inbox = new MessageInbox(socket);
    await waitForOpen(socket);

    socket.send(JSON.stringify({ type: "resume", lastSeq: 0 }));
    socket.send(JSON.stringify({ type: "resize", cols: 120, rows: 35 }));
    socket.send(JSON.stringify({ type: "input", data: "ORDERED" }));

    await inbox.next((message) => message.type === "hello");
    await waitUntil(() => harness.pty.latest().events.length >= 2);

    expect(harness.pty.latest().events.slice(0, 2)).toEqual([
      { type: "resize", cols: 120, rows: 35 },
      { type: "write", data: "ORDERED" }
    ]);

    const response = await getSession(harness, cookie, session.id);
    expect(response.status).toBe(200);
    const body = await response.json() as { session: SessionPublic };
    expect(body.session.cols).toBe(120);
    expect(body.session.rows).toBe(35);

    socket.close(1000, "test complete");
  });

  it("keeps the PTY alive across browser disconnect and replays retained output", async () => {
    const harness = await startHarness();
    const cookie = await login(harness);
    const session = await createSession(harness, cookie);

    const firstSocket = socketFor(harness, session.id, cookie);
    const firstInbox = new MessageInbox(firstSocket);
    await waitForOpen(firstSocket);
    firstSocket.send(JSON.stringify({ type: "resume", lastSeq: 0 }));
    await firstInbox.next((message) => message.type === "hello");

    harness.pty.latest().emitData("PALMTTY_READY\r\n");
    await firstInbox.waitForText("PALMTTY_READY");
    const resumeFrom = firstInbox.latestSeq;
    expect(resumeFrom).toBeGreaterThan(0);

    const firstClosed = waitForClose(firstSocket);
    firstSocket.close(1000, "simulate browser navigation");
    await firstClosed;

    harness.pty.latest().emitData("LATE_MARKER\r\n");
    await waitUntil(async () => {
      const response = await getSession(harness, cookie, session.id);
      if (response.status !== 200) return false;
      const body = await response.json() as { session: SessionPublic };
      return body.session.state === "running" && body.session.connections === 0;
    });

    const secondSocket = socketFor(harness, session.id, cookie);
    const secondInbox = new MessageInbox(secondSocket);
    await waitForOpen(secondSocket);
    secondSocket.send(JSON.stringify({ type: "resume", lastSeq: resumeFrom }));

    await secondInbox.next((message) => message.type === "hello");
    const recovery = await secondInbox.next(
      (message) => message.type === "output" || message.type === "snapshot"
    );
    expect(recovery).toMatchObject({ type: "output", data: "LATE_MARKER\r\n" });
    expect(secondInbox.transcript).toContain("LATE_MARKER");

    secondSocket.close(1000, "test complete");
  });

  it("falls back to a snapshot when replay history is stale", async () => {
    const harness = await startHarness((config) => {
      // Below the user-configurable minimum on purpose: this makes history eviction
      // deterministic without generating megabytes of output in the test.
      config.sessions.replayBytes = 64;
    });
    const cookie = await login(harness);
    const session = await createSession(harness, cookie);

    const firstSocket = socketFor(harness, session.id, cookie);
    const firstInbox = new MessageInbox(firstSocket);
    await waitForOpen(firstSocket);
    firstSocket.send(JSON.stringify({ type: "resume", lastSeq: 0 }));
    await firstInbox.next((message) => message.type === "hello");

    harness.pty.latest().emitData("PALMTTY_READY\r\n");
    await firstInbox.waitForText("PALMTTY_READY");
    const staleSeq = firstInbox.latestSeq;
    expect(staleSeq).toBeGreaterThan(0);

    harness.pty.latest().emitData(`${"B".repeat(4096)}STALE_MARKER\r\n`);
    await firstInbox.waitForText("STALE_MARKER");

    const closed = waitForClose(firstSocket);
    firstSocket.close(1000, "force stale resume");
    await closed;

    const secondSocket = socketFor(harness, session.id, cookie);
    const secondInbox = new MessageInbox(secondSocket);
    await waitForOpen(secondSocket);
    secondSocket.send(JSON.stringify({ type: "resume", lastSeq: staleSeq }));

    await secondInbox.next((message) => message.type === "hello");
    const recovery = await secondInbox.next(
      (message) => message.type === "snapshot" || message.type === "output"
    );
    expect(recovery.type).toBe("snapshot");
    if (recovery.type === "snapshot") {
      expect(recovery.data).toContain("STALE_MARKER");
    }

    secondSocket.close(1000, "test complete");
  });

  it("rediscovers the same live worker after the Agent restarts", async () => {
    const harness = await startHarness();
    const firstCookie = await login(harness);
    const session = await createSession(harness, firstCookie);

    const firstSocket = socketFor(harness, session.id, firstCookie);
    const firstInbox = new MessageInbox(firstSocket);
    await waitForOpen(firstSocket);
    firstSocket.send(JSON.stringify({ type: "resume", lastSeq: 0 }));
    await firstInbox.next((message) => message.type === "hello");

    harness.pty.latest().emitData("BEFORE_AGENT_RESTART\r\n");
    await firstInbox.waitForText("BEFORE_AGENT_RESTART");
    const resumeFrom = firstInbox.latestSeq;
    const originalPid = session.pid;

    await harness.app.close();
    liveApps.delete(harness.app);

    harness.pty.latest().emitData("DURING_AGENT_RESTART\r\n");

    const restartedApp = await buildApp(harness.config, {
      sessionManager: {
        runtimeDir: harness.runtimeDir,
        workerSpawner: harness.workerSpawner
      }
    });
    liveApps.add(restartedApp);
    const restartedAddress = await restartedApp.listen({ host: "127.0.0.1", port: 0 });
    const restartedOrigin = new URL(restartedAddress).origin;
    harness.config.server.port = Number(new URL(restartedOrigin).port);
    harness.config.server.trustedOrigins = [restartedOrigin];

    const restartedHarness: Harness = {
      ...harness,
      app: restartedApp,
      origin: restartedOrigin,
      wsBase: restartedOrigin.replace(/^http/, "ws")
    };
    const secondCookie = await login(restartedHarness);

    const sessionsResponse = await fetch(`${restartedOrigin}/api/v1/sessions`, {
      headers: { cookie: secondCookie }
    });
    expect(sessionsResponse.status).toBe(200);
    const sessionsBody = await sessionsResponse.json() as { sessions: SessionPublic[] };
    expect(sessionsBody.sessions).toContainEqual(expect.objectContaining({
      id: session.id,
      pid: originalPid,
      state: "running"
    }));

    const secondSocket = socketFor(restartedHarness, session.id, secondCookie);
    const secondInbox = new MessageInbox(secondSocket);
    await waitForOpen(secondSocket);
    secondSocket.send(JSON.stringify({ type: "resume", lastSeq: resumeFrom }));

    await secondInbox.next((message) => message.type === "hello");
    await secondInbox.waitForText("DURING_AGENT_RESTART");
    expect(secondInbox.transcript).toContain("DURING_AGENT_RESTART");

    secondSocket.close(1000, "test complete");
  }, 10_000);

  it("actively closes established sockets when authentication expires", async () => {
    const harness = await startHarness();
    const realDateNow = Date.now;
    const loginNow = realDateNow();
    let cookie: string;
    try {
      // Keep the production-valid 5-minute TTL, but create this one login session
      // as if almost all of that lifetime had already elapsed.
      Date.now = () => loginNow - (5 * 60_000 - 3_000);
      cookie = await login(harness);
    } finally {
      Date.now = realDateNow;
    }
    const session = await createSession(harness, cookie);
    const socket = socketFor(harness, session.id, cookie);
    const inbox = new MessageInbox(socket);
    const closed = waitForClose(socket, 5_000);
    await waitForOpen(socket);
    socket.send(JSON.stringify({ type: "resume", lastSeq: 0 }));
    await inbox.next((message) => message.type === "hello");

    await expect(closed).resolves.toMatchObject({
      code: 1008,
      reason: "Authentication expired"
    });
  }, 8_000);

  it("cuts off slow clients and retains then cleans up exited sessions", async () => {
    const harness = await startHarness((config) => {
      // Test-only short retention; production configuration enforces >= 1 minute.
      config.sessions.exitedRetentionMinutes = 0.01;
    });
    const cookie = await login(harness);
    const session = await createSession(harness, cookie);

    const slowSocket = socketFor(harness, session.id, cookie);
    const slowInbox = new MessageInbox(slowSocket);
    await waitForOpen(slowSocket);
    slowSocket.send(JSON.stringify({ type: "resume", lastSeq: 0 }));
    await slowInbox.next((message) => message.type === "hello");

    // Force the configured cutoff branch deterministically after attachment.
    harness.config.sessions.maxSocketBufferedBytes = -1;
    const slowClosed = waitForClose(slowSocket);
    harness.pty.latest().emitData("BACKPRESSURE\r\n");
    await expect(slowClosed).resolves.toMatchObject({
      code: 1013,
      reason: "Client is too slow; reconnect to resume"
    });

    harness.config.sessions.maxSocketBufferedBytes = 2 * 1024 * 1024;
    const exitSocket = socketFor(harness, session.id, cookie);
    const exitInbox = new MessageInbox(exitSocket);
    await waitForOpen(exitSocket);
    exitSocket.send(JSON.stringify({ type: "resume", lastSeq: 0 }));
    await exitInbox.next((message) => message.type === "hello");

    harness.pty.latest().emitExit(7);

    const exit = await exitInbox.next((message) => message.type === "exit");
    expect(exit).toMatchObject({ type: "exit", exitCode: 7 });

    const retained = await getSession(harness, cookie, session.id);
    expect(retained.status).toBe(200);
    const retainedBody = await retained.json() as { session: SessionPublic };
    expect(retainedBody.session.state).toBe("exited");

    await waitUntil(async () => (await getSession(harness, cookie, session.id)).status === 404, 3_000);
  }, 10_000);
});
