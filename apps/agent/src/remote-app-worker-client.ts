import { randomBytes } from "node:crypto";
import net from "node:net";
import {
  AppSessionPublicSchema,
  type AppSessionPublic
} from "@palmtty/protocol";
import {
  FramedJsonSocket,
  REMOTE_APP_WORKER_PROTOCOL_VERSION,
  RemoteAppWorkerEventSchema
} from "./remote-app-worker-protocol.js";
import { remoteAppEndpoint } from "./remote-app-worker-storage.js";

const CONNECT_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 8_000;
const HEARTBEAT_INTERVAL_MS = 5_000;

type StatusListener = (session: AppSessionPublic) => void;
type CloseListener = () => void;

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class RemoteAppWorkerClient {
  private readonly framed: FramedJsonSocket;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly closeListeners = new Set<CloseListener>();
  private latestSession: AppSessionPublic | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private heartbeatBusy = false;
  private closed = false;

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
  }): Promise<RemoteAppWorkerClient> {
    const endpoint = remoteAppEndpoint(options.runtimeDir, options.endpointId);
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const candidate = net.createConnection(endpoint);
      const timer = setTimeout(() => {
        candidate.destroy();
        reject(new Error("Remote App Worker connection timed out"));
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

    const client = new RemoteAppWorkerClient(socket, options.runtimeDir, options.endpointId);
    try {
      const result = await client.request({
        type: "auth",
        protocol: REMOTE_APP_WORKER_PROTOCOL_VERSION,
        secret: options.secret
      });
      if (!result || typeof result !== "object" || !("session" in result)) {
        throw new Error("Remote App Worker authentication response was malformed");
      }
      client.latestSession = AppSessionPublicSchema.parse(
        (result as { session: unknown }).session
      );
      client.startHeartbeat();
      return client;
    } catch (error) {
      client.close();
      throw error;
    }
  }

  get session(): AppSessionPublic {
    if (!this.latestSession) throw new Error("Remote App Worker has not authenticated");
    return this.latestSession;
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

  async negotiate(clientId: string, offerSdp: string): Promise<string> {
    const result = await this.request({
      type: "negotiate",
      clientId,
      offerSdp
    });
    if (!result || typeof result !== "object" || !("answerSdp" in result)) {
      throw new Error("Remote App Worker returned a malformed WebRTC answer");
    }
    const answer = (result as { answerSdp: unknown }).answerSdp;
    if (typeof answer !== "string" || answer.length === 0) {
      throw new Error("Remote App Worker returned an empty WebRTC answer");
    }
    return answer;
  }

  async detach(clientId: string): Promise<void> {
    await this.request({ type: "detach", clientId });
  }

  async terminate(): Promise<void> {
    await this.request({ type: "terminate" });
  }

  async retire(): Promise<void> {
    await this.request({ type: "retire" });
  }

  close(): void {
    if (this.closed) return;
    this.framed.destroy();
  }

  private request(
    request: Record<string, unknown> & { type: string }
  ): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("Remote App Worker is disconnected"));
    }
    const requestId = randomBytes(12).toString("base64url");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Remote App Worker request timed out: ${request.type}`));
      }, REQUEST_TIMEOUT_MS);
      timer.unref();
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.framed.send({ ...request, requestId });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error
          ? error
          : new Error("Remote App Worker request failed"));
      }
    });
  }

  private handleFrame(value: unknown): void {
    const parsed = RemoteAppWorkerEventSchema.safeParse(value);
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
      if (event.ok) pending.resolve(event.result);
      else pending.reject(new Error(event.error ?? "Remote App Worker rejected request"));
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
      pending.reject(new Error("Remote App Worker disconnected"));
    }
    this.pending.clear();
    for (const listener of [...this.closeListeners]) listener();
    this.statusListeners.clear();
    this.closeListeners.clear();
  }
}
