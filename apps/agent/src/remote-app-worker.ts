import { timingSafeEqual } from "node:crypto";
import { chmod } from "node:fs/promises";
import net from "node:net";
import {
  FramedJsonSocket,
  REMOTE_APP_WORKER_PROTOCOL_VERSION,
  RemoteAppWorkerBootstrapSchema,
  RemoteAppWorkerRequestSchema,
  type RemoteAppWorkerBootstrap,
  type RemoteAppWorkerRequest
} from "./remote-app-worker-protocol.js";
import {
  ensureRemoteAppRuntimeLayout,
  readRemoteAppRecord,
  readRemoteAppSecret,
  remoteAppEndpoint,
  removeRemoteAppWorkerState,
  writeRemoteAppRecord,
  writeRemoteAppSecret
} from "./remote-app-worker-storage.js";
import { RemoteAppRuntime } from "./remote-app-runtime.js";

const AUTH_TIMEOUT_MS = 3_000;
const MAX_PENDING_CONNECTIONS = 4;
const ADOPTION_TIMEOUT_MS = 15_000;
const WATCHDOG_INTERVAL_MS = 15_000;
const WATCHDOG_FAILURES = 2;
const MAX_BOOTSTRAP_BYTES = 2 * 1024 * 1024;

function secretsEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class RemoteAppWorkerServer {
  private readonly runtime: RemoteAppRuntime;
  private readonly endpoint: string;
  private server: net.Server | undefined;
  private controller: FramedJsonSocket | undefined;
  private readonly connections = new Set<FramedJsonSocket>();
  private adopted = false;
  private shuttingDown = false;
  private adoptionTimer: NodeJS.Timeout | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private watchdogFailures = 0;
  private retentionTimer: NodeJS.Timeout | undefined;
  private commandPipeline: Promise<void> = Promise.resolve();

  constructor(
    readonly bootstrap: RemoteAppWorkerBootstrap,
    private readonly onRetired?: () => void
  ) {
    RemoteAppWorkerBootstrapSchema.parse(bootstrap);
    this.endpoint = remoteAppEndpoint(bootstrap.runtimeDir, bootstrap.endpointId);
    this.runtime = new RemoteAppRuntime(bootstrap);
    this.runtime.onStatus(() => this.publishStatus());
    this.runtime.onExit(() => {
      this.publishStatus();
      this.scheduleRetention();
    });
  }

  async start(): Promise<void> {
    try {
      await ensureRemoteAppRuntimeLayout(this.bootstrap.runtimeDir);
      await this.runtime.start();
      await writeRemoteAppSecret(
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
      if (process.platform !== "win32") await chmod(this.endpoint, 0o600);

      await writeRemoteAppRecord(this.bootstrap.runtimeDir, this.recoveryRecord());
      this.startAdoptionTimer();
      this.startWatchdog();
    } catch (error) {
      await this.shutdown({ killApp: true, cleanupState: true });
      throw error;
    }
  }

  async shutdown(options: {
    killApp: boolean;
    cleanupState: boolean;
  }): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    if (this.adoptionTimer) clearTimeout(this.adoptionTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    if (this.retentionTimer) clearTimeout(this.retentionTimer);

    for (const connection of [...this.connections]) connection.destroy();
    this.connections.clear();
    this.controller = undefined;

    const server = this.server;
    this.server = undefined;
    if (server?.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    await this.runtime.dispose(options.killApp);
    if (options.cleanupState) {
      await removeRemoteAppWorkerState(this.bootstrap.runtimeDir, {
        sessionId: this.bootstrap.sessionId,
        endpointId: this.bootstrap.endpointId
      });
    }
  }

  private recoveryRecord() {
    return {
      version: 1 as const,
      sessionId: this.bootstrap.sessionId,
      workspaceId: this.bootstrap.workspaceId,
      profileId: this.bootstrap.profile.id,
      profileName: this.bootstrap.profile.name,
      createdAt: this.bootstrap.createdAt,
      endpointId: this.bootstrap.endpointId,
      workerPid: process.pid,
      appPid: this.runtime.pid
    };
  }

  private startAdoptionTimer(): void {
    this.adoptionTimer = setTimeout(() => {
      if (this.adopted || this.shuttingDown) return;
      void this.shutdown({ killApp: true, cleanupState: true }).then(() => {
        this.onRetired?.();
      });
    }, ADOPTION_TIMEOUT_MS);
    this.adoptionTimer.unref();
  }

  private startWatchdog(): void {
    this.watchdog = setInterval(() => {
      void this.verifyPublishedState();
    }, WATCHDOG_INTERVAL_MS);
    this.watchdog.unref();
  }

  private scheduleRetention(): void {
    if (this.retentionTimer || this.shuttingDown) return;
    this.retentionTimer = setTimeout(() => {
      void this.shutdown({ killApp: false, cleanupState: true }).then(() => {
        this.onRetired?.();
      });
    }, this.bootstrap.exitedRetentionMinutes * 60_000);
    this.retentionTimer.unref();
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
      let recordMissing = false;
      let secretMissing = false;
      let record: Awaited<ReturnType<typeof readRemoteAppRecord>> | undefined;
      let secret: string | undefined;

      try {
        record = await readRemoteAppRecord(
          this.bootstrap.runtimeDir,
          this.bootstrap.sessionId
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") recordMissing = true;
        else throw error;
      }
      try {
        secret = await readRemoteAppSecret(
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
          record.workerPid !== process.pid ||
          record.appPid !== this.runtime.pid ||
          record.profileId !== this.bootstrap.profile.id
        )
      ) {
        throw new Error("Remote App recovery record belongs to another process");
      }
      if (secret !== undefined && !secretsEqual(secret, this.bootstrap.secret)) {
        throw new Error("Remote App recovery secret was replaced");
      }

      if (recordMissing || secretMissing) {
        await ensureRemoteAppRuntimeLayout(this.bootstrap.runtimeDir);
        if (secretMissing) {
          await writeRemoteAppSecret(
            this.bootstrap.runtimeDir,
            this.bootstrap.sessionId,
            this.bootstrap.secret
          );
        }
        if (recordMissing) {
          await writeRemoteAppRecord(this.bootstrap.runtimeDir, this.recoveryRecord());
        }
      }
      this.watchdogFailures = 0;
    } catch {
      this.watchdogFailures += 1;
      if (this.watchdogFailures < WATCHDOG_FAILURES) return;
      await this.shutdown({ killApp: true, cleanupState: false });
      this.onRetired?.();
    }
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
      const parsed = RemoteAppWorkerRequestSchema.safeParse(value);
      if (!parsed.success) {
        framed.destroy();
        return;
      }
      if (!authenticated) {
        if (
          parsed.data.type !== "auth" ||
          parsed.data.protocol !== REMOTE_APP_WORKER_PROTOCOL_VERSION ||
          !secretsEqual(parsed.data.secret, this.bootstrap.secret)
        ) {
          framed.destroy();
          return;
        }
        authenticated = true;
        clearTimeout(authTimer);
        if (this.controller && this.controller !== framed) this.controller.destroy();
        this.controller = framed;
        this.respond(framed, parsed.data.requestId, {
          session: this.runtime.toPublic()
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
      if (this.controller === framed) this.controller = undefined;
    });
  }

  private async handleRequest(
    connection: FramedJsonSocket,
    request: Exclude<RemoteAppWorkerRequest, { type: "auth" }>
  ): Promise<void> {
    if (this.controller !== connection || this.shuttingDown) return;
    try {
      switch (request.type) {
        case "adopt":
          this.markAdopted();
          this.respond(connection, request.requestId, { adopted: true });
          return;
        case "negotiate": {
          const answerSdp = await this.runtime.negotiate(
            request.clientId,
            request.offerSdp
          );
          this.respond(connection, request.requestId, { answerSdp });
          this.publishStatus();
          return;
        }
        case "detach":
          this.runtime.detach(request.clientId);
          this.respond(connection, request.requestId, { detached: true });
          this.publishStatus();
          return;
        case "terminate":
          await this.runtime.terminate();
          this.respond(connection, request.requestId, { terminating: true });
          this.publishStatus();
          return;
        case "retire":
          if (this.runtime.active) throw new Error("Remote App Session is still active");
          this.respond(connection, request.requestId, { retiring: true });
          setImmediate(() => {
            void this.shutdown({ killApp: false, cleanupState: true }).then(() => {
              this.onRetired?.();
            });
          });
          return;
        case "ping":
          this.respond(connection, request.requestId, { pong: true });
          return;
      }
    } catch (error) {
      this.respondError(
        connection,
        request.requestId,
        error instanceof Error ? error.message : "Remote App Worker command failed"
      );
    }
  }

  private publishStatus(): void {
    const controller = this.controller;
    if (!controller) return;
    try {
      controller.send({
        type: "status",
        session: this.runtime.toPublic()
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
    connection.send({ type: "response", requestId, ok: true, result });
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

export async function readRemoteAppWorkerBootstrapFromStdin():
Promise<RemoteAppWorkerBootstrap> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  const timeout = setTimeout(() => process.stdin.destroy(), 5_000);
  timeout.unref();
  try {
    for await (const chunk of process.stdin) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > MAX_BOOTSTRAP_BYTES) {
        throw new Error("Remote App Worker bootstrap exceeds 2 MiB");
      }
      chunks.push(buffer);
    }
  } finally {
    clearTimeout(timeout);
  }
  if (bytes === 0) throw new Error("Remote App Worker bootstrap was empty");
  return RemoteAppWorkerBootstrapSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8"))
  );
}

export async function runRemoteAppWorkerFromStdin(): Promise<void> {
  const bootstrap = await readRemoteAppWorkerBootstrapFromStdin();
  const worker = new RemoteAppWorkerServer(bootstrap, () => {
    // @roamhq/wrtc owns native libwebrtc state. Exiting this disposable
    // AppWorker avoids coupling native teardown to the long-lived Agent.
    setImmediate(() => process.exit(0));
  });
  await worker.start();
  process.stdout.write("PALMTTY_REMOTE_APP_WORKER_READY\n");

  const shutdown = () => {
    void worker.shutdown({ killApp: true, cleanupState: true }).finally(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
