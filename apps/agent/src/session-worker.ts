import { timingSafeEqual } from "node:crypto";
import { chmod } from "node:fs/promises";
import net from "node:net";
import {
  FramedJsonSocket,
  WORKER_PROTOCOL_VERSION,
  WorkerBootstrapSchema,
  WorkerRequestSchema,
  type WorkerBootstrap,
  type WorkerRequest
} from "./worker-protocol.js";
import {
  ensureRuntimeLayout,
  readWorkerRecord,
  readWorkerSecret,
  removeWorkerState,
  workerEndpoint,
  writeWorkerRecord,
  writeWorkerSecret
} from "./worker-storage.js";
import {
  SessionRuntime,
  type PtyFactory
} from "./session-runtime.js";

const AUTH_TIMEOUT_MS = 3_000;
const MAX_PENDING_CONNECTIONS = 8;
const MAX_WORKER_SOCKET_BUFFER_BYTES = 8 * 1024 * 1024;
const MAX_BOOTSTRAP_BYTES = 1024 * 1024;
const STATE_WATCHDOG_INTERVAL_MS = 15_000;
const STATE_WATCHDOG_FAILURES = 2;
const ADOPTION_TIMEOUT_MS = 15_000;

export type SessionWorkerServerOptions = {
  ptyFactory?: PtyFactory;
  onRetired?: () => void;
  stateWatchdogIntervalMs?: number;
  stateWatchdogFailures?: number;
  adoptionTimeoutMs?: number;
};

function secretsEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class SessionWorkerServer {
  private readonly runtime: SessionRuntime;
  private readonly endpoint: string;
  private server: net.Server | undefined;
  private controller: FramedJsonSocket | undefined;
  private readonly connections = new Set<FramedJsonSocket>();
  private readonly attachedClients = new Set<string>();
  private commandPipeline: Promise<void> = Promise.resolve();
  private stateWatchdog: NodeJS.Timeout | undefined;
  private stateWatchdogFailures = 0;
  private adoptionTimer: NodeJS.Timeout | undefined;
  private adopted = false;
  private shuttingDown = false;

  constructor(
    readonly bootstrap: WorkerBootstrap,
    private readonly options: SessionWorkerServerOptions = {}
  ) {
    WorkerBootstrapSchema.parse(bootstrap);
    this.endpoint = workerEndpoint(bootstrap.runtimeDir, bootstrap.endpointId);
    this.runtime = new SessionRuntime({
      id: bootstrap.sessionId,
      workspace: bootstrap.workspace,
      createdAt: bootstrap.createdAt,
      cols: bootstrap.cols,
      rows: bootstrap.rows,
      config: bootstrap.session,
      excludedEnvKeys: bootstrap.excludedEnvKeys,
      ...(options.ptyFactory ? { ptyFactory: options.ptyFactory } : {})
    });

    this.runtime.onMessage((message) => {
      const controller = this.controller;
      if (!controller) return;
      try {
        if (controller.socket.writableLength > MAX_WORKER_SOCKET_BUFFER_BYTES) {
          controller.destroy();
          return;
        }
        for (const clientId of this.attachedClients) {
          controller.send({ type: "deliver", clientId, message });
        }
        if (message.type === "exit") this.publishStatus();
      } catch {
        controller.destroy();
      }
    });

    this.runtime.onRetire(() => {
      void this.shutdown({ killPty: false, cleanupState: true }).then(() => {
        this.options.onRetired?.();
      });
    });
  }

  async start(): Promise<void> {
    try {
      await ensureRuntimeLayout(this.bootstrap.runtimeDir);
      await writeWorkerSecret(
        this.bootstrap.runtimeDir,
        this.bootstrap.sessionId,
        this.bootstrap.secret
      );

      const server = net.createServer((socket) => this.accept(socket));
      this.server = server;

      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(this.endpoint);
      });

      if (process.platform !== "win32") {
        await chmod(this.endpoint, 0o600);
      }

      await writeWorkerRecord(
        this.bootstrap.runtimeDir,
        this.recoveryRecord()
      );
      this.startStateWatchdog();
      this.startAdoptionTimer();
    } catch (error) {
      await this.shutdown({ killPty: true, cleanupState: true });
      throw error;
    }
  }

  async shutdown(options: {
    killPty: boolean;
    cleanupState: boolean;
  }): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    if (this.stateWatchdog) clearInterval(this.stateWatchdog);
    if (this.adoptionTimer) clearTimeout(this.adoptionTimer);

    for (const connection of [...this.connections]) connection.destroy();
    this.connections.clear();
    this.attachedClients.clear();
    this.controller = undefined;

    const server = this.server;
    this.server = undefined;
    if (server?.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    await this.runtime.dispose(options.killPty);
    if (options.cleanupState) {
      await removeWorkerState(this.bootstrap.runtimeDir, {
        sessionId: this.bootstrap.sessionId,
        endpointId: this.bootstrap.endpointId
      });
    }
  }

  private startStateWatchdog(): void {
    this.stateWatchdog = setInterval(() => {
      void this.verifyPublishedState();
    }, this.options.stateWatchdogIntervalMs ?? STATE_WATCHDOG_INTERVAL_MS);
    this.stateWatchdog.unref();
  }

  private startAdoptionTimer(): void {
    this.adoptionTimer = setTimeout(() => {
      if (this.adopted || this.shuttingDown) return;
      void this.shutdown({ killPty: true, cleanupState: true }).then(() => {
        this.options.onRetired?.();
      });
    }, this.options.adoptionTimeoutMs ?? ADOPTION_TIMEOUT_MS);
    this.adoptionTimer.unref();
  }

  private markAdopted(): void {
    if (this.adopted) return;
    this.adopted = true;
    if (this.adoptionTimer) {
      clearTimeout(this.adoptionTimer);
      this.adoptionTimer = undefined;
    }
  }

  private async verifyPublishedState(): Promise<void> {
    if (this.shuttingDown) return;

    try {
      let record: Awaited<ReturnType<typeof readWorkerRecord>> | undefined;
      let secret: string | undefined;
      let recordMissing = false;
      let secretMissing = false;

      try {
        record = await readWorkerRecord(
          this.bootstrap.runtimeDir,
          this.bootstrap.sessionId
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") recordMissing = true;
        else throw error;
      }

      try {
        secret = await readWorkerSecret(
          this.bootstrap.runtimeDir,
          this.bootstrap.sessionId
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") secretMissing = true;
        else throw error;
      }

      if (
        record && (
          record.endpointId !== this.bootstrap.endpointId ||
          record.workerPid !== process.pid
        )
      ) {
        throw new Error("Worker recovery record belongs to another process");
      }
      if (secret !== undefined && !secretsEqual(secret, this.bootstrap.secret)) {
        throw new Error("Worker recovery secret was replaced");
      }

      if (recordMissing || secretMissing) {
        // Recovery metadata is Worker-owned state. Recreate missing artifacts
        // instead of turning an Agent cleanup race into terminal termination.
        await ensureRuntimeLayout(this.bootstrap.runtimeDir);
        if (secretMissing) {
          await writeWorkerSecret(
            this.bootstrap.runtimeDir,
            this.bootstrap.sessionId,
            this.bootstrap.secret
          );
        }
        if (recordMissing) {
          await writeWorkerRecord(
            this.bootstrap.runtimeDir,
            this.recoveryRecord()
          );
        }
      }

      this.stateWatchdogFailures = 0;
    } catch {
      this.stateWatchdogFailures += 1;
      if (
        this.stateWatchdogFailures <
        (this.options.stateWatchdogFailures ?? STATE_WATCHDOG_FAILURES)
      ) return;

      // Conflicting/corrupt recovery authority is different from missing state:
      // fail closed rather than overwrite another process's capability.
      await this.shutdown({ killPty: true, cleanupState: false });
      this.options.onRetired?.();
    }
  }

  private recoveryRecord() {
    return {
      version: 1 as const,
      sessionId: this.bootstrap.sessionId,
      workspaceId: this.bootstrap.workspace.id,
      createdAt: this.bootstrap.createdAt,
      endpointId: this.bootstrap.endpointId,
      workerPid: process.pid,
      shellPid: this.runtime.pid
    };
  }

  private accept(socket: net.Socket): void {
    if (this.shuttingDown || this.connections.size >= MAX_PENDING_CONNECTIONS) {
      socket.destroy();
      return;
    }

    socket.setNoDelay(true);
    const framed = new FramedJsonSocket(socket);
    this.connections.add(framed);
    let authenticated = false;

    const authTimer = setTimeout(() => framed.destroy(), AUTH_TIMEOUT_MS);
    authTimer.unref();

    framed.onFrame((value) => {
      const parsed = WorkerRequestSchema.safeParse(value);
      if (!parsed.success) {
        framed.destroy();
        return;
      }

      if (!authenticated) {
        if (parsed.data.type !== "auth") {
          framed.destroy();
          return;
        }
        if (
          parsed.data.protocol !== WORKER_PROTOCOL_VERSION ||
          !secretsEqual(parsed.data.secret, this.bootstrap.secret)
        ) {
          framed.destroy();
          return;
        }

        authenticated = true;
        clearTimeout(authTimer);
        if (this.controller && this.controller !== framed) {
          this.controller.destroy();
        }
        this.controller = framed;
        this.attachedClients.clear();
        this.respond(framed, parsed.data.requestId, {
          session: this.runtime.toPublic(0)
        });
        this.publishStatus();
        return;
      }

      if (parsed.data.type === "auth" || this.controller !== framed) {
        framed.destroy();
        return;
      }

      const request = parsed.data;
      const run = this.commandPipeline.then(
        () => this.handleRequest(framed, request),
        () => this.handleRequest(framed, request)
      );
      this.commandPipeline = run.then(() => undefined, () => undefined);
    });

    framed.onClose(() => {
      clearTimeout(authTimer);
      this.connections.delete(framed);
      if (this.controller === framed) {
        this.controller = undefined;
        this.attachedClients.clear();
      }
    });
  }

  private async handleRequest(
    connection: FramedJsonSocket,
    request: Exclude<WorkerRequest, { type: "auth" }>
  ): Promise<void> {
    if (this.controller !== connection || this.shuttingDown) return;

    try {
      switch (request.type) {
        case "adopt":
          this.markAdopted();
          this.respond(connection, request.requestId, { adopted: true });
          return;

        case "attach":
          await this.runtime.recover(request.lastSeq, (messages) => {
            for (const message of messages) {
              connection.send({
                type: "deliver",
                clientId: request.clientId,
                message
              });
            }
            this.attachedClients.add(request.clientId);
          });
          this.respond(connection, request.requestId, { attached: true });
          this.publishStatus();
          return;

        case "detach":
          this.attachedClients.delete(request.clientId);
          this.respond(connection, request.requestId, { detached: true });
          this.publishStatus();
          return;

        case "input":
          await this.runtime.write(request.data);
          this.respond(connection, request.requestId, { accepted: true });
          return;

        case "resize":
          await this.runtime.resize(request.cols, request.rows);
          this.respond(connection, request.requestId, { resized: true });
          this.publishStatus();
          return;

        case "terminate":
          await this.runtime.terminate();
          this.respond(connection, request.requestId, { terminating: true });
          return;

        case "ping":
          this.respond(connection, request.requestId, { pong: true });
          return;
      }
    } catch (error) {
      this.respondError(
        connection,
        request.requestId,
        error instanceof Error ? error.message : "Worker command failed"
      );
    }
  }

  private publishStatus(): void {
    const controller = this.controller;
    if (!controller) return;
    try {
      controller.send({
        type: "status",
        session: this.runtime.toPublic(this.attachedClients.size)
      });
    } catch {
      controller.destroy();
    }
  }

  private respond(
    connection: FramedJsonSocket,
    requestId: string,
    result: unknown
  ): void {
    connection.send({
      type: "response",
      requestId,
      ok: true,
      result
    });
  }

  private respondError(
    connection: FramedJsonSocket,
    requestId: string,
    error: string
  ): void {
    connection.send({
      type: "response",
      requestId,
      ok: false,
      error: error.slice(0, 512)
    });
  }
}

export async function readWorkerBootstrapFromStdin(): Promise<WorkerBootstrap> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  const timeout = setTimeout(() => process.stdin.destroy(), 5_000);
  timeout.unref();

  try {
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > MAX_BOOTSTRAP_BYTES) {
        throw new Error("Session worker bootstrap exceeds the configured bound");
      }
      chunks.push(buffer);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (bytes === 0) throw new Error("Session worker bootstrap was empty");
  return WorkerBootstrapSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8"))
  );
}

export async function runSessionWorkerFromStdin(): Promise<void> {
  const bootstrap = await readWorkerBootstrapFromStdin();
  const worker = new SessionWorkerServer(bootstrap, {
    onRetired: () => {
      setImmediate(() => process.exit(0));
    }
  });
  await worker.start();
  process.stdout.write("PALMTTY_WORKER_READY\n");

  const shutdown = () => {
    void worker.shutdown({ killPty: true, cleanupState: true }).finally(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
