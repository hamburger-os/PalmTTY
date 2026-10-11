import net from "node:net";
import { z } from "zod";
import {
  RuntimeWorkspaceSchema,
  SessionLaunchRuntimeSchema
} from "./workspace-runtime.js";
import {
  MAX_INPUT_BYTES,
  ServerMessageSchema,
  SessionPublicSchema,
  TerminalColumnsSchema,
  TerminalRowsSchema
} from "@palmtty/protocol";

export const WORKER_PROTOCOL_VERSION = 5 as const;
export const MAX_WORKER_FRAME_BYTES = 8 * 1024 * 1024;

const SessionWorkerConfigSchema = z.object({
  exitedRetentionMinutes: z.number().positive().max(1440),
  scrollbackLines: z.number().int().min(100).max(20_000),
  replayBytes: z.number().int().positive().max(64 * 1024 * 1024)
});

export const WorkerBootstrapSchema = z.object({
  protocol: z.literal(WORKER_PROTOCOL_VERSION),
  runtimeDir: z.string().min(1),
  sessionId: z.string().min(16).max(128),
  endpointId: z.string().min(16).max(128),
  secret: z.string().min(32).max(256),
  excludedEnvKeys: z.array(z.string().min(1).max(256)).max(64),
  traceWindowsSpawn: z.boolean().optional(),
  createdAt: z.string().datetime(),
  workspace: RuntimeWorkspaceSchema,
  launchRuntime: SessionLaunchRuntimeSchema,
  session: SessionWorkerConfigSchema,
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(200)
});
export type WorkerBootstrap = z.infer<typeof WorkerBootstrapSchema>;

const RequestIdSchema = z.string().min(1).max(128);

export const WorkerRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    requestId: RequestIdSchema,
    protocol: z.literal(WORKER_PROTOCOL_VERSION),
    secret: z.string().min(1).max(256)
  }),
  z.object({
    type: z.literal("adopt"),
    requestId: RequestIdSchema
  }),
  z.object({
    type: z.literal("attach"),
    requestId: RequestIdSchema,
    clientId: z.string().min(1).max(128),
    lastSeq: z.number().int().nonnegative(),
    cols: TerminalColumnsSchema,
    rows: TerminalRowsSchema
  }),
  z.object({
    type: z.literal("detach"),
    requestId: RequestIdSchema,
    clientId: z.string().min(1).max(128)
  }),
  z.object({
    type: z.literal("input"),
    requestId: RequestIdSchema,
    data: z.string().refine(
      (value) => Buffer.byteLength(value, "utf8") <= MAX_INPUT_BYTES,
      "terminal input exceeds 64 KiB"
    )
  }),
  z.object({
    type: z.literal("resize"),
    requestId: RequestIdSchema,
    cols: z.number().int().min(2).max(500),
    rows: z.number().int().min(1).max(200)
  }),
  z.object({
    type: z.literal("terminate"),
    requestId: RequestIdSchema
  }),
  z.object({
    type: z.literal("retire"),
    requestId: RequestIdSchema
  }),
  z.object({
    type: z.literal("ping"),
    requestId: RequestIdSchema
  })
]);
export type WorkerRequest = z.infer<typeof WorkerRequestSchema>;

export const WorkerResponseSchema = z.object({
  type: z.literal("response"),
  requestId: RequestIdSchema,
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().max(512).optional()
});

export const WorkerDeliverSchema = z.object({
  type: z.literal("deliver"),
  clientId: z.string().min(1).max(128),
  message: ServerMessageSchema
});

export const WorkerStatusSchema = z.object({
  type: z.literal("status"),
  session: SessionPublicSchema
});

export const WorkerEventSchema = z.discriminatedUnion("type", [
  WorkerResponseSchema,
  WorkerDeliverSchema,
  WorkerStatusSchema
]);
export type WorkerEvent = z.infer<typeof WorkerEventSchema>;

type FrameListener = (value: unknown) => void;
type CloseListener = () => void;

export class FramedJsonSocket {
  private readonly header = Buffer.alloc(4);
  private headerBytes = 0;
  private frame: Buffer | undefined;
  private frameBytes = 0;
  private readonly frameListeners = new Set<FrameListener>();
  private readonly closeListeners = new Set<CloseListener>();
  private closed = false;

  constructor(readonly socket: net.Socket) {
    socket.on("data", (chunk) => this.consume(chunk));
    socket.on("close", () => this.finish());
    socket.on("error", () => this.finish());
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  send(value: unknown): void {
    if (this.closed || this.socket.destroyed) throw new Error("Worker IPC socket is closed");
    const payload = Buffer.from(JSON.stringify(value), "utf8");
    if (payload.byteLength === 0 || payload.byteLength > MAX_WORKER_FRAME_BYTES) {
      throw new Error("Worker IPC frame exceeds the configured bound");
    }
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(payload.byteLength, 0);
    this.socket.write(Buffer.concat([header, payload]));
  }

  destroy(): void {
    this.socket.destroy();
    this.finish();
  }

  end(): void {
    this.socket.end();
  }

  private consume(chunk: Buffer<ArrayBufferLike>): void {
    if (this.closed) return;
    let offset = 0;
    // Each frame is allocated once and filled linearly, even when the OS
    // delivers a multi-megabyte snapshot as thousands of small chunks.
    while (offset < chunk.length) {
      if (!this.frame) {
        const take = Math.min(4 - this.headerBytes, chunk.length - offset);
        chunk.copy(this.header, this.headerBytes, offset, offset + take);
        this.headerBytes += take;
        offset += take;
        if (this.headerBytes < 4) return;
        const length = this.header.readUInt32BE(0);
        this.headerBytes = 0;
        if (length === 0 || length > MAX_WORKER_FRAME_BYTES) {
          this.destroy();
          return;
        }
        this.frame = Buffer.allocUnsafe(length);
        this.frameBytes = 0;
      }

      const frame = this.frame;
      const take = Math.min(frame.length - this.frameBytes, chunk.length - offset);
      chunk.copy(frame, this.frameBytes, offset, offset + take);
      this.frameBytes += take;
      offset += take;
      if (this.frameBytes !== frame.length) continue;

      this.frame = undefined;
      this.frameBytes = 0;
      let parsed: unknown;
      try {
        parsed = JSON.parse(frame.toString("utf8"));
      } catch {
        this.destroy();
        return;
      }
      for (const listener of [...this.frameListeners]) listener(parsed);
      if (this.closed) return;
    }
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer = Buffer.alloc(0);
    for (const listener of [...this.closeListeners]) listener();
    this.frameListeners.clear();
    this.closeListeners.clear();
  }
}
