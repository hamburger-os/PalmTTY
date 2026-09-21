import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;
export const WS_SUBPROTOCOL = "palmtty.v1";
export const MAX_INPUT_BYTES = 64 * 1024;
export const MAX_MESSAGE_BYTES = 80 * 1024;

const encoder = new TextEncoder();
function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

const WorkspaceIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const HostRuntimeSchema = z.object({
  kind: z.literal("host"),
  shell: z.string().min(1).max(1024).optional(),
  args: z.array(z.string().max(4096)).max(32).default([])
}).strict();

const WslRuntimeSchema = z.object({
  kind: z.literal("wsl"),
  distribution: z.string().min(1).max(128).optional(),
  shell: z.string().min(1).max(1024).optional(),
  args: z.array(z.string().max(4096)).max(32).default([])
}).strict().superRefine((runtime, ctx) => {
  if (runtime.args.length > 0 && !runtime.shell) {
    ctx.addIssue({
      code: "custom",
      path: ["shell"],
      message: "WSL shell arguments require an explicit shell"
    });
  }
});

export const WorkspaceRuntimeSchema = z.discriminatedUnion("kind", [
  HostRuntimeSchema,
  WslRuntimeSchema
]);
export type WorkspaceRuntime = z.infer<typeof WorkspaceRuntimeSchema>;

export const WorkspaceDefinitionSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().trim().min(1).max(100),
  cwd: z.string().trim().min(1).max(4096),
  runtime: WorkspaceRuntimeSchema,
  startupCommand: z.string().max(8192).optional()
}).strict();
export type WorkspaceDefinition = z.infer<typeof WorkspaceDefinitionSchema>;

export const CreateWorkspaceSchema = WorkspaceDefinitionSchema.omit({ id: true });
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

export const WorkspacePublicSchema = WorkspaceDefinitionSchema;
export type WorkspacePublic = WorkspaceDefinition;

export const RuntimeCapabilitiesSchema = z.object({
  platform: z.enum(["win32", "linux", "darwin", "other"]),
  runtimes: z.object({
    host: z.literal(true),
    wsl: z.boolean()
  }).strict()
}).strict();
export type RuntimeCapabilities = z.infer<typeof RuntimeCapabilitiesSchema>;

export const SessionStateSchema = z.enum(["starting", "running", "exited", "failed"]);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionPublicSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  state: SessionStateSchema,
  createdAt: z.string(),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(200),
  connections: z.number().int().nonnegative(),
  pid: z.number().int().positive().optional(),
  exitCode: z.number().int().optional()
});
export type SessionPublic = z.infer<typeof SessionPublicSchema>;

export const CreateSessionSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  cols: z.number().int().min(2).max(500).default(80),
  rows: z.number().int().min(1).max(200).default(24)
});
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export const ResumeMessageSchema = z.object({
  type: z.literal("resume"),
  lastSeq: z.number().int().nonnegative()
});

export const InputMessageSchema = z.object({
  type: z.literal("input"),
  data: z.string().superRefine((value, ctx) => {
    if (utf8ByteLength(value) > MAX_INPUT_BYTES) {
      ctx.addIssue({ code: "custom", message: "terminal input exceeds 64 KiB" });
    }
  })
});

export const ResizeMessageSchema = z.object({
  type: z.literal("resize"),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(200)
});

export const PingMessageSchema = z.object({
  type: z.literal("ping"),
  id: z.string().min(1).max(128)
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ResumeMessageSchema,
  InputMessageSchema,
  ResizeMessageSchema,
  PingMessageSchema
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const HelloMessageSchema = z.object({
  type: z.literal("hello"),
  protocol: z.literal(PROTOCOL_VERSION),
  sessionId: z.string(),
  state: SessionStateSchema,
  cols: z.number().int(),
  rows: z.number().int(),
  latestSeq: z.number().int().nonnegative()
});

export const SnapshotMessageSchema = z.object({
  type: z.literal("snapshot"),
  seq: z.number().int().nonnegative(),
  data: z.string()
});

export const OutputMessageSchema = z.object({
  type: z.literal("output"),
  seq: z.number().int().positive(),
  data: z.string()
});

export const ExitMessageSchema = z.object({
  type: z.literal("exit"),
  exitCode: z.number().int().optional()
});

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string()
});

export const PongMessageSchema = z.object({
  type: z.literal("pong"),
  id: z.string()
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  HelloMessageSchema,
  SnapshotMessageSchema,
  OutputMessageSchema,
  ExitMessageSchema,
  ErrorMessageSchema,
  PongMessageSchema
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function parseClientMessage(raw: string): ClientMessage {
  if (utf8ByteLength(raw) > MAX_MESSAGE_BYTES) {
    throw new Error("WebSocket frame too large");
  }
  return ClientMessageSchema.parse(JSON.parse(raw));
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(ServerMessageSchema.parse(message));
}
