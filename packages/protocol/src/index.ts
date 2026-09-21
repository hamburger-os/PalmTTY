import { z } from "zod";

export const PROTOCOL_VERSION = 3 as const;
export const WS_SUBPROTOCOL = "palmtty.v3";
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

const WorkspaceEnvironmentKeySchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

export const WorkspaceEnvironmentSchema = z.record(
  WorkspaceEnvironmentKeySchema,
  z.string().max(8192)
).superRefine((environment, ctx) => {
  const keys = Object.keys(environment);
  if (keys.length > 64) {
    ctx.addIssue({
      code: "custom",
      message: "Workspace environment is limited to 64 variables"
    });
  }

  const normalized = new Set<string>();
  for (const key of keys) {
    const canonical = key.toLowerCase();
    if (normalized.has(canonical)) {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "Environment variable names must be unique ignoring case"
      });
    }
    normalized.add(canonical);
    if (canonical === "term") {
      ctx.addIssue({
        code: "custom",
        path: [key],
        message: "TERM is managed by PalmTTY"
      });
    }
  }
});
export type WorkspaceEnvironment = z.infer<typeof WorkspaceEnvironmentSchema>;

export const WorkspaceDefinitionSchema = z.object({
  id: WorkspaceIdSchema,
  name: z.string().trim().min(1).max(100),
  cwd: z.string().trim().min(1).max(4096),
  runtime: WorkspaceRuntimeSchema,
  environment: WorkspaceEnvironmentSchema.optional(),
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

const HostShellProfilesRequestSchema = z.object({
  kind: z.literal("host")
}).strict();

const WslShellProfilesRequestSchema = z.object({
  kind: z.literal("wsl"),
  distribution: z.string().trim().min(1).max(128).optional()
}).strict();

export const DetectShellProfilesRequestSchema = z.discriminatedUnion("kind", [
  HostShellProfilesRequestSchema,
  WslShellProfilesRequestSchema
]);
export type DetectShellProfilesRequest = z.infer<typeof DetectShellProfilesRequestSchema>;

export const ShellProfileSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
  shell: z.string().min(1).max(4096),
  args: z.array(z.string().max(4096)).max(32),
  recommended: z.boolean()
}).strict();
export type ShellProfile = z.infer<typeof ShellProfileSchema>;

export const ShellProfilesResponseSchema = z.object({
  profiles: z.array(ShellProfileSchema).max(32)
}).strict();

const BrowseHostDirectorySchema = z.object({
  kind: z.literal("host"),
  path: z.string().trim().min(1).max(4096).optional()
}).strict();

const BrowseWslDirectorySchema = z.object({
  kind: z.literal("wsl"),
  distribution: z.string().trim().min(1).max(128).optional(),
  path: z.string().trim().min(1).max(4096).optional()
}).strict();

export const BrowseDirectoryRequestSchema = z.discriminatedUnion("kind", [
  BrowseHostDirectorySchema,
  BrowseWslDirectorySchema
]);
export type BrowseDirectoryRequest = z.infer<typeof BrowseDirectoryRequestSchema>;

export const DirectoryLocationSchema = z.object({
  label: z.string().min(1).max(512),
  path: z.string().min(1).max(4096)
}).strict();
export type DirectoryLocation = z.infer<typeof DirectoryLocationSchema>;

export const DirectoryListingSchema = z.object({
  currentPath: z.string().min(1).max(4096),
  parentPath: z.string().min(1).max(4096).nullable(),
  locations: z.array(DirectoryLocationSchema).max(64),
  directories: z.array(DirectoryLocationSchema).max(512),
  truncated: z.boolean()
}).strict();
export type DirectoryListing = z.infer<typeof DirectoryListingSchema>;

export const SessionStateSchema = z.enum([
  "starting",
  "running",
  "stopping",
  "exited",
  "failed"
]);
export type SessionState = z.infer<typeof SessionStateSchema>;

export function isActiveSessionState(state: SessionState): boolean {
  return state === "starting" || state === "running" || state === "stopping";
}

export function isTerminalSessionState(state: SessionState): boolean {
  return state === "exited" || state === "failed";
}

export const TerminalColumnsSchema = z.number().int().min(2).max(500);
export const TerminalRowsSchema = z.number().int().min(1).max(200);

export const SessionPublicSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  state: SessionStateSchema,
  createdAt: z.string(),
  cols: TerminalColumnsSchema,
  rows: TerminalRowsSchema,
  connections: z.number().int().nonnegative(),
  pid: z.number().int().positive().optional(),
  exitCode: z.number().int().optional()
});
export type SessionPublic = z.infer<typeof SessionPublicSchema>;

export const CreateSessionSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  cols: TerminalColumnsSchema.default(80),
  rows: TerminalRowsSchema.default(24)
});
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export const ResumeMessageSchema = z.object({
  type: z.literal("resume"),
  lastSeq: z.number().int().nonnegative(),
  cols: TerminalColumnsSchema,
  rows: TerminalRowsSchema
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
  cols: TerminalColumnsSchema,
  rows: TerminalRowsSchema
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
  cols: TerminalColumnsSchema,
  rows: TerminalRowsSchema,
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
