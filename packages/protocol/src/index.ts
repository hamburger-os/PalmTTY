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

export const DetectTerminalProfilesRequestSchema = z.object({}).strict();
export type DetectTerminalProfilesRequest = z.infer<
  typeof DetectTerminalProfilesRequestSchema
>;

export const TerminalProfileSchema = z.object({
  id: z.string().min(1).max(256),
  label: z.string().min(1).max(256),
  runtime: WorkspaceRuntimeSchema,
  recommended: z.boolean()
}).strict();
export type TerminalProfile = z.infer<typeof TerminalProfileSchema>;

export const TerminalProfilesResponseSchema = z.object({
  profiles: z.array(TerminalProfileSchema).max(64)
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

export const WorkspaceRelativePathSchema = z.string()
  .max(4096)
  .refine((value) => !value.includes("\0"), "path must not contain NUL")
  .refine((value) => !value.includes("\\"), "workspace paths use forward slashes")
  .refine(
    (value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value),
    "workspace path must be relative"
  )
  .refine((value) => {
    if (value === "") return true;
    const parts = value.split("/");
    return parts.every(
      (part) => part.length > 0 && part !== ".." && part !== "."
    );
  }, "workspace path must use canonical segments");

export const WorkspaceFileListRequestSchema = z.object({
  path: WorkspaceRelativePathSchema.default("")
}).strict();
export type WorkspaceFileListRequest = z.infer<typeof WorkspaceFileListRequestSchema>;

export const WorkspaceFileEntrySchema = z.object({
  name: z.string().min(1).max(1024),
  path: WorkspaceRelativePathSchema,
  kind: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative().optional()
}).strict();
export type WorkspaceFileEntry = z.infer<typeof WorkspaceFileEntrySchema>;

export const WorkspaceFileListResponseSchema = z.object({
  path: WorkspaceRelativePathSchema,
  parentPath: WorkspaceRelativePathSchema.nullable(),
  entries: z.array(WorkspaceFileEntrySchema).max(512),
  truncated: z.boolean()
}).strict();
export type WorkspaceFileListResponse = z.infer<typeof WorkspaceFileListResponseSchema>;

export const WorkspaceFileReadRequestSchema = z.object({
  path: WorkspaceRelativePathSchema.refine(
    (value) => value.length > 0,
    "file path is required"
  )
}).strict();
export type WorkspaceFileReadRequest = z.infer<typeof WorkspaceFileReadRequestSchema>;

export const WorkspaceFileReadResponseSchema = z.object({
  path: WorkspaceRelativePathSchema,
  size: z.number().int().nonnegative(),
  binary: z.boolean(),
  content: z.string(),
  truncated: z.boolean()
}).strict();
export type WorkspaceFileReadResponse = z.infer<typeof WorkspaceFileReadResponseSchema>;

export const GitFileStatusSchema = z.enum([
  "modified",
  "typeChanged",
  "added",
  "deleted",
  "renamed",
  "copied",
  "unmerged"
]);
export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;

export const GitChangeKindSchema = z.enum([
  "modified",
  "typeChanged",
  "added",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "conflict",
  "submodule"
]);
export type GitChangeKind = z.infer<typeof GitChangeKindSchema>;

const GitPathSchema = WorkspaceRelativePathSchema.refine(
  (value) => value.length > 0,
  "Git path is required"
);

export const GitChangeSchema = z.object({
  path: GitPathSchema,
  originalPath: GitPathSchema.optional(),
  kind: GitChangeKindSchema,
  indexStatus: GitFileStatusSchema.optional(),
  worktreeStatus: GitFileStatusSchema.optional(),
  staged: z.boolean(),
  unstaged: z.boolean(),
  untracked: z.boolean(),
  conflict: z.boolean()
}).strict();
export type GitChange = z.infer<typeof GitChangeSchema>;

const GitObjectIdSchema = z.string().regex(/^[0-9a-f]{40,64}$/i);
export const GitStateTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export type GitStateToken = z.infer<typeof GitStateTokenSchema>;

export const GitRepositoryContextSchema = z.object({
  root: z.string().min(1).max(4096),
  workspacePath: WorkspaceRelativePathSchema,
  scope: z.literal("repository"),
  head: z.object({
    oid: GitObjectIdSchema.optional(),
    branch: z.string().min(1).max(512).optional(),
    detached: z.boolean(),
    unborn: z.boolean()
  }).strict(),
  upstream: z.string().min(1).max(512).optional(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  stateToken: GitStateTokenSchema
}).strict();
export type GitRepositoryContext = z.infer<typeof GitRepositoryContextSchema>;

export const GitStatusResponseSchema = z.object({
  available: z.boolean(),
  repository: GitRepositoryContextSchema.optional(),
  changes: z.array(GitChangeSchema).max(2048),
  truncated: z.boolean()
}).strict();
export type GitStatusResponse = z.infer<typeof GitStatusResponseSchema>;

export const GitDiffRequestSchema = z.object({
  path: GitPathSchema,
  staged: z.boolean().default(false)
}).strict();
export type GitDiffRequest = z.infer<typeof GitDiffRequestSchema>;

export const GitDiffResponseSchema = z.object({
  path: GitPathSchema,
  staged: z.boolean(),
  diff: z.string().max(1024 * 1024),
  truncated: z.boolean(),
  binary: z.boolean(),
  snapshot: GitStateTokenSchema
}).strict();
export type GitDiffResponse = z.infer<typeof GitDiffResponseSchema>;

export const GitHistoryRequestSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20)
}).strict();
export type GitHistoryRequest = z.infer<typeof GitHistoryRequestSchema>;

export const GitCommitSummarySchema = z.object({
  oid: GitObjectIdSchema,
  shortOid: z.string().min(4).max(64),
  author: z.string().max(512),
  authoredAt: z.string().max(64),
  subject: z.string().max(4096)
}).strict();
export type GitCommitSummary = z.infer<typeof GitCommitSummarySchema>;

export const GitHistoryResponseSchema = z.object({
  commits: z.array(GitCommitSummarySchema).max(50)
}).strict();
export type GitHistoryResponse = z.infer<typeof GitHistoryResponseSchema>;

export const GitBranchSchema = z.object({
  name: z.string().min(1).max(512),
  oid: GitObjectIdSchema,
  upstream: z.string().min(1).max(512).optional(),
  current: z.boolean()
}).strict();
export type GitBranch = z.infer<typeof GitBranchSchema>;

export const GitBranchesResponseSchema = z.object({
  branches: z.array(GitBranchSchema).max(256),
  truncated: z.boolean()
}).strict();
export type GitBranchesResponse = z.infer<typeof GitBranchesResponseSchema>;

const GitMutationPathsSchema = z.array(GitPathSchema).min(1).max(128);
const GitBranchNameSchema = z.string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !/[\0\r\n]/.test(value), "Git branch name is invalid");

export const GitMutationOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    paths: GitMutationPathsSchema
  }).strict(),
  z.object({
    type: z.literal("unstage"),
    paths: GitMutationPathsSchema
  }).strict(),
  z.object({
    type: z.literal("restore"),
    path: GitPathSchema,
    diffSnapshot: GitStateTokenSchema
  }).strict(),
  z.object({
    type: z.literal("commit"),
    message: z.string().trim().min(1).max(4096)
  }).strict(),
  z.object({
    type: z.literal("branch.create"),
    name: GitBranchNameSchema
  }).strict(),
  z.object({
    type: z.literal("branch.switch"),
    name: GitBranchNameSchema
  }).strict(),
  z.object({
    type: z.literal("stash.push"),
    includeUntracked: z.boolean().default(true)
  }).strict(),
  z.object({
    type: z.literal("stash.pop")
  }).strict()
]);
export type GitMutationOperation = z.infer<typeof GitMutationOperationSchema>;

export const GitMutationRequestSchema = z.object({
  expectedState: GitStateTokenSchema,
  allowRepositoryCodeExecution: z.literal(true),
  operation: GitMutationOperationSchema
}).strict();
export type GitMutationRequest = z.infer<typeof GitMutationRequestSchema>;

export const GitMutationResponseSchema = z.object({
  status: GitStatusResponseSchema
}).strict();
export type GitMutationResponse = z.infer<typeof GitMutationResponseSchema>;

export const GitRemoteOperationSchema = z.enum(["fetch", "pull", "push"]);
export type GitRemoteOperation = z.infer<typeof GitRemoteOperationSchema>;

export const GitRemoteRequestSchema = z.object({
  expectedState: GitStateTokenSchema,
  allowRepositoryCodeExecution: z.literal(true),
  operation: GitRemoteOperationSchema
}).strict();
export type GitRemoteRequest = z.infer<typeof GitRemoteRequestSchema>;

export const GitRemoteResponseSchema = z.object({
  status: GitStatusResponseSchema
}).strict();
export type GitRemoteResponse = z.infer<typeof GitRemoteResponseSchema>;

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
