import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import type { PalmTTYConfig } from "@palmtty/config";
import {
  encodeServerMessage,
  type SessionPublic,
  type ServerMessage
} from "@palmtty/protocol";
import type WebSocket from "ws";
import { WorkerClient } from "./worker-client.js";
import type { WorkerBootstrap } from "./worker-protocol.js";
import { ProcessWorkerSpawner, type WorkerSpawner } from "./worker-spawner.js";
import {
  cleanupDanglingWorkerState,
  defaultRuntimeDir,
  ensureRuntimeLayout,
  listWorkerRecords,
  readWorkerRecord,
  readWorkerSecret,
  removeWorkerState,
  type WorkerRecord
} from "./worker-storage.js";

type ManagedWorker = {
  record: WorkerRecord;
  secret: string;
  worker: WorkerClient;
  session: SessionPublic;
  clients: Map<string, WebSocket>;
  reconnecting: boolean;
};

export type SessionManagerOptions = {
  runtimeDir?: string;
  workerSpawner?: WorkerSpawner;
};

const CREATE_CONNECT_DELAYS_MS = [0, 50, 100, 200, 400, 800, 1200, 1600];
const REDISCOVER_CONNECT_DELAYS_MS = [0, 100, 250, 500, 1000];
const RECONNECT_DELAYS_MS = [100, 250, 500, 1000, 2000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionId(): string {
  return randomBytes(18).toString("base64url");
}

function endpointId(): string {
  return randomBytes(18).toString("base64url");
}

function workerSecret(): string {
  return randomBytes(32).toString("base64url");
}

export class SessionManager {
  readonly runtimeDir: string;
  private readonly workerSpawner: WorkerSpawner;
  private readonly sessions = new Map<string, ManagedWorker>();
  private initialized = false;
  private closing = false;

  constructor(
    private readonly config: PalmTTYConfig,
    options: SessionManagerOptions = {}
  ) {
    this.runtimeDir = options.runtimeDir ?? defaultRuntimeDir();
    this.workerSpawner = options.workerSpawner ?? new ProcessWorkerSpawner();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await ensureRuntimeLayout(this.runtimeDir);
    await cleanupDanglingWorkerState(this.runtimeDir);

    const records = await listWorkerRecords(this.runtimeDir);
    await Promise.all(records.map(async (record) => {
      try {
        const secret = await readWorkerSecret(this.runtimeDir, record.sessionId);
        const worker = await this.connectWithRetry(
          record.endpointId,
          secret,
          REDISCOVER_CONNECT_DELAYS_MS
        );
        this.install({
          record,
          secret,
          worker,
          session: worker.session,
          clients: new Map(),
          reconnecting: false
        });
      } catch {
        // A stale record is not authority to kill a PID: PIDs can be reused.
        // Only authenticated IPC can terminate a worker.
        await removeWorkerState(this.runtimeDir, record);
      }
    }));
  }

  list(): SessionPublic[] {
    return [...this.sessions.values()]
      .map((managed) => this.publicSession(managed))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): SessionPublic | undefined {
    const managed = this.sessions.get(id);
    return managed ? this.publicSession(managed) : undefined;
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  async create(workspaceId: string, cols: number, rows: number): Promise<SessionPublic> {
    this.requireInitialized();

    const active = [...this.sessions.values()].filter(({ session }) =>
      session.state === "running" || session.state === "starting"
    );
    if (active.length >= this.config.sessions.maxSessions) {
      throw new Error("Maximum session count reached");
    }

    const workspace = this.config.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error("Unknown workspace");
    if (!existsSync(workspace.cwd)) throw new Error("Workspace directory is unavailable");

    const id = sessionId();
    const endpoint = endpointId();
    const secret = workerSecret();
    const createdAt = new Date().toISOString();
    const bootstrap: WorkerBootstrap = {
      protocol: 1,
      runtimeDir: this.runtimeDir,
      sessionId: id,
      endpointId: endpoint,
      secret,
      excludedEnvKeys: [this.config.auth.tokenEnv],
      createdAt,
      workspace,
      session: {
        exitedRetentionMinutes: this.config.sessions.exitedRetentionMinutes,
        scrollbackLines: this.config.sessions.scrollbackLines,
        replayBytes: this.config.sessions.replayBytes
      },
      cols,
      rows
    };

    await this.workerSpawner.spawn(bootstrap);
    const worker = await this.connectWithRetry(
      endpoint,
      secret,
      CREATE_CONNECT_DELAYS_MS
    );
    const record = await this.readRecordWithRetry(id);

    const managed: ManagedWorker = {
      record,
      secret,
      worker,
      session: worker.session,
      clients: new Map(),
      reconnecting: false
    };
    this.install(managed);
    return this.publicSession(managed);
  }

  async attach(id: string, socket: WebSocket, lastSeq: number): Promise<void> {
    const managed = this.requireManaged(id);
    const clientId = randomBytes(12).toString("base64url");
    managed.clients.set(clientId, socket);
    try {
      await managed.worker.attach(clientId, lastSeq);
    } catch (error) {
      managed.clients.delete(clientId);
      throw error;
    }
  }

  detach(id: string, socket: WebSocket): void {
    const managed = this.sessions.get(id);
    if (!managed) return;
    for (const [clientId, candidate] of managed.clients) {
      if (candidate !== socket) continue;
      managed.clients.delete(clientId);
      void managed.worker.detach(clientId).catch(() => undefined);
      break;
    }
  }

  async write(id: string, data: string): Promise<void> {
    await this.requireManaged(id).worker.write(data);
  }

  async resize(id: string, cols: number, rows: number): Promise<void> {
    await this.requireManaged(id).worker.resize(cols, rows);
  }

  async terminate(id: string): Promise<boolean> {
    const managed = this.sessions.get(id);
    if (!managed) return false;
    await managed.worker.terminate();
    return true;
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    for (const managed of this.sessions.values()) {
      for (const socket of managed.clients.values()) {
        try {
          socket.close(1001, "PalmTTY Agent restarting");
        } catch {
          // Best effort during Agent shutdown.
        }
      }
      managed.clients.clear();
      managed.worker.close();
    }
    this.sessions.clear();
  }

  private install(managed: ManagedWorker): void {
    this.sessions.set(managed.record.sessionId, managed);

    managed.worker.onDeliver((clientId, message) => {
      this.deliver(managed, clientId, message);
    });

    managed.worker.onStatus((session) => {
      managed.session = session;
    });

    managed.worker.onClose(() => {
      if (this.closing || this.sessions.get(managed.record.sessionId) !== managed) return;

      if (managed.session.state === "exited") {
        this.sessions.delete(managed.record.sessionId);
        for (const socket of managed.clients.values()) {
          try {
            socket.close(1000, "Exited session retention expired");
          } catch {
            // Best effort during normal retired-session cleanup.
          }
        }
        managed.clients.clear();
        return;
      }

      for (const socket of managed.clients.values()) {
        try {
          socket.close(1012, "Session worker reconnecting");
        } catch {
          // Best effort: browser reconnect logic will retry.
        }
      }
      managed.clients.clear();
      void this.reconnect(managed);
    });
  }

  private deliver(
    managed: ManagedWorker,
    clientId: string,
    message: ServerMessage
  ): void {
    const socket = managed.clients.get(clientId);
    if (!socket) return;

    if (socket.readyState !== 1) {
      managed.clients.delete(clientId);
      void managed.worker.detach(clientId).catch(() => undefined);
      return;
    }

    if (socket.bufferedAmount > this.config.sessions.maxSocketBufferedBytes) {
      managed.clients.delete(clientId);
      void managed.worker.detach(clientId).catch(() => undefined);
      try {
        socket.close(1013, "Client is too slow; reconnect to resume");
      } catch {
        // Best effort.
      }
      return;
    }

    socket.send(encodeServerMessage(message));
  }

  private async reconnect(managed: ManagedWorker): Promise<void> {
    if (managed.reconnecting || this.closing) return;
    managed.reconnecting = true;

    try {
      const worker = await this.connectWithRetry(
        managed.record.endpointId,
        managed.secret,
        RECONNECT_DELAYS_MS
      );
      if (this.closing || this.sessions.get(managed.record.sessionId) !== managed) {
        worker.close();
        return;
      }
      managed.worker = worker;
      managed.session = worker.session;
      managed.reconnecting = false;
      this.install(managed);
    } catch {
      managed.reconnecting = false;
      if (this.sessions.get(managed.record.sessionId) === managed) {
        this.sessions.delete(managed.record.sessionId);
      }
      await removeWorkerState(this.runtimeDir, managed.record);
    }
  }

  private async connectWithRetry(
    endpoint: string,
    secret: string,
    delays: number[]
  ): Promise<WorkerClient> {
    let lastError: unknown;
    for (const delay of delays) {
      if (delay > 0) await sleep(delay);
      try {
        return await WorkerClient.connect({
          runtimeDir: this.runtimeDir,
          endpointId: endpoint,
          secret
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to connect to session worker");
  }

  private async readRecordWithRetry(id: string): Promise<WorkerRecord> {
    let lastError: unknown;
    for (const delay of [0, 25, 50, 100, 200, 400]) {
      if (delay > 0) await sleep(delay);
      try {
        return await readWorkerRecord(this.runtimeDir, id);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Session worker did not publish its metadata");
  }

  private publicSession(managed: ManagedWorker): SessionPublic {
    return {
      ...managed.session,
      connections: managed.clients.size
    };
  }

  private requireManaged(id: string): ManagedWorker {
    const managed = this.sessions.get(id);
    if (!managed) throw new Error("Unknown session");
    if (managed.reconnecting) throw new Error("Session worker is reconnecting");
    return managed;
  }

  private requireInitialized(): void {
    if (!this.initialized) throw new Error("Session manager is not initialized");
  }
}
