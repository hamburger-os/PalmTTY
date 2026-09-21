import { randomBytes } from "node:crypto";
import net from "node:net";
import { SessionPublicSchema, type ServerMessage, type SessionPublic } from "@palmtty/protocol";
import {
  FramedJsonSocket,
  WORKER_PROTOCOL_VERSION,
  WorkerEventSchema
} from "./worker-protocol.js";
import { workerEndpoint } from "./worker-storage.js";

const CONNECT_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 5_000;

type DeliverListener = (clientId: string, message: ServerMessage) => void;
type StatusListener = (session: SessionPublic) => void;
type CloseListener = () => void;

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class WorkerClient {
  private readonly framed: FramedJsonSocket;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly deliverListeners = new Set<DeliverListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly closeListeners = new Set<CloseListener>();
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private heartbeatBusy = false;
  private closed = false;
  private latestSession: SessionPublic | undefined;

  private constructor(
    socket: net.Socket,
    readonly runtimeDir: string,
    readonly endpointId: string
  ) {
    this.framed = new FramedJsonSocket(socket);
    this.framed.onFrame((value) => this.handleFrame(value));
    this.framed.onClose(() => this.handleClose());
  }

  static async connect(options: {
    runtimeDir: string;
    endpointId: string;
    secret: string;
  }): Promise<WorkerClient> {
    const endpoint = workerEndpoint(options.runtimeDir, options.endpointId);
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const candidate = net.createConnection(endpoint);
      const timer = setTimeout(() => {
        candidate.destroy();
        reject(new Error("Session worker connection timed out"));
      }, CONNECT_TIMEOUT_MS);
      timer.unref();

      candidate.once("connect", () => {
        clearTimeout(timer);
        candidate.setNoDelay(true);
        resolve(candidate);
      });
      candidate.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    const client = new WorkerClient(socket, options.runtimeDir, options.endpointId);
    try {
      const result = await client.request({
        type: "auth",
        protocol: WORKER_PROTOCOL_VERSION,
        secret: options.secret
      });
      if (!result || typeof result !== "object" || !("session" in result)) {
        throw new Error("Session worker authentication response was malformed");
      }
      client.latestSession = SessionPublicSchema.parse(
        (result as { session: unknown }).session
      );
      client.startHeartbeat();
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  get session(): SessionPublic {
    if (!this.latestSession) throw new Error("Worker has not authenticated");
    return this.latestSession;
  }

  onDeliver(listener: DeliverListener): () => void {
    this.deliverListeners.add(listener);
    return () => this.deliverListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  async adopt(): Promise<void> {
    await this.request({ type: "adopt" });
  }

  async attach(
    clientId: string,
    lastSeq: number,
    cols: number,
    rows: number
  ): Promise<void> {
    await this.request({ type: "attach", clientId, lastSeq, cols, rows });
  }

  async detach(clientId: string): Promise<void> {
    await this.request({ type: "detach", clientId });
  }

  async write(data: string): Promise<void> {
    await this.request({ type: "input", data });
  }

  async resize(cols: number, rows: number): Promise<void> {
    await this.request({ type: "resize", cols, rows });
  }

  async terminate(): Promise<void> {
    await this.request({ type: "terminate" });
  }

  close(): void {
    if (this.closed) return;
    this.framed.destroy();
  }

  private request(
    request: Record<string, unknown> & { type: string }
  ): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("Session worker is disconnected"));
    const requestId = randomBytes(12).toString("base64url");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Session worker request timed out: ${request.type}`));
      }, REQUEST_TIMEOUT_MS);
      timer.unref();

      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.framed.send({ ...request, requestId });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error("Session worker request failed"));
      }
    });
  }

  private handleFrame(value: unknown): void {
    const parsed = WorkerEventSchema.safeParse(value);
    if (!parsed.success) {
      this.framed.destroy();
      return;
    }

    const event = parsed.data;
    if (event.type === "response") {
      const pending = this.pending.get(event.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(event.requestId);
      if (event.ok) {
        pending.resolve(event.result);
      } else {
        pending.reject(new Error(event.error ?? "Session worker rejected request"));
      }
      return;
    }

    if (event.type === "deliver") {
      for (const listener of [...this.deliverListeners]) {
        listener(event.clientId, event.message);
      }
      return;
    }

    this.latestSession = event.session;
    for (const listener of [...this.statusListeners]) listener(event.session);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.closed || this.heartbeatBusy) return;
      this.heartbeatBusy = true;
      void this.request({ type: "ping" })
        .catch(() => this.framed.destroy())
        .finally(() => {
          this.heartbeatBusy = false;
        });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Session worker disconnected"));
    }
    this.pending.clear();
    for (const listener of [...this.closeListeners]) listener();
    this.deliverListeners.clear();
    this.statusListeners.clear();
    this.closeListeners.clear();
  }
}
