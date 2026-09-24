import { createHash } from "node:crypto";
import {
  GitBranchesResponseSchema,
  GitCommitDetailResponseSchema,
  GitCommitDiffResponseSchema,
  GitDiffResponseSchema,
  GitHistoryResponseSchema,
  GitMutationResponseSchema,
  GitRemoteResponseSchema,
  type GitBranchesResponse,
  type GitCommitDetailResponse,
  type GitCommitDiffResponse,
  type GitCommitFile,
  type GitDiffResponse,
  type GitHistoryRequest,
  type GitHistoryResponse,
  type GitMutationRequest,
  type GitMutationResponse,
  type GitRemoteRequest,
  type GitRemoteResponse,
  type GitStatusResponse,
  type WorkspaceDefinition
} from "@palmtty/protocol";
import {
  GIT_BRANCH_LIMIT_BYTES,
  GIT_DIFF_LIMIT_BYTES,
  GIT_HISTORY_LIMIT_BYTES,
  MAX_GIT_BRANCHES,
  disabledHooksArgs,
  discoverGitRepository,
  gitNullDevice,
  runWorkspaceGit,
  validateGitPath,
  validateGitPaths
} from "./runner.js";
import { GitStateChangedError } from "./errors.js";
import {
  getGitStatus,
  requireExpectedGitState
} from "./status.js";

const GIT_REMOTE_LIMIT_BYTES = 512 * 1024;
const GIT_COMMIT_DETAIL_LIMIT_BYTES = 512 * 1024;
const GIT_COMMIT_FILES_LIMIT_BYTES = 512 * 1024;
const MAX_GIT_COMMIT_FILES = 2048;
const GIT_HISTORY_CURSOR_VERSION = 1;
const repositoryWritePipelines = new Map<string, Promise<void>>();

const SAFE_REMOTE_PROTOCOL_ARGS = [
  "-c", "protocol.allow=never",
  "-c", "protocol.http.allow=always",
  "-c", "protocol.https.allow=always",
  "-c", "protocol.ssh.allow=always",
  "-c", "protocol.git.allow=always",
  "-c", "protocol.ext.allow=never",
  "-c", "protocol.file.allow=never"
];

async function requireRepository(
  workspace: WorkspaceDefinition,
  excludedEnvironmentKeys: string[]
): Promise<{ root: string; workspacePath: string }> {
  const repository = await discoverGitRepository(
    workspace,
    excludedEnvironmentKeys
  );
  if (!repository) {
    throw new Error("Workspace is not inside a Git repository");
  }
  return repository;
}

function repositoryWriteKey(
  workspace: WorkspaceDefinition,
  root: string
): string {
  const normalizedRoot = workspace.runtime.kind === "host" && process.platform === "win32"
    ? root.toLowerCase()
    : root;
  if (workspace.runtime.kind === "wsl") {
    return `wsl:${workspace.runtime.distribution ?? ""}:${normalizedRoot}`;
  }
  return `host:${normalizedRoot}`;
}

async function serializedRepositoryWrite<T>(
  workspace: WorkspaceDefinition,
  root: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = repositoryWriteKey(workspace, root);
  const previous = repositoryWritePipelines.get(key) ?? Promise.resolve();
  const current = previous.then(operation);
  const tail = current.then(() => undefined, () => undefined);
  repositoryWritePipelines.set(key, tail);
  try {
    return await current;
  } finally {
    if (repositoryWritePipelines.get(key) === tail) {
      repositoryWritePipelines.delete(key);
    }
  }
}

function hashBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeFilterDriver(value: string): string | undefined {
  if (value === "") return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error("Git filter driver name cannot be neutralized safely");
  }
  return value;
}

async function safeWorkingTreeDiffConfig(
  workspace: WorkspaceDefinition,
  root: string,
  path: string,
  excludedEnvironmentKeys: string[]
): Promise<string[]> {
  const result = await runWorkspaceGit(
    workspace,
    root,
    ["check-attr", "-z", "filter", "--", path],
    excludedEnvironmentKeys,
    { maxStdoutBytes: 32 * 1024 }
  );
  const fields = result.stdout.toString("utf8").split("\0");
  const attribute = fields[1] ?? "";
  const driver = safeFilterDriver(fields[2] ?? "");
  if (attribute !== "filter" || !driver) return [];

  return [
    "-c", `filter.${driver}.clean=`,
    "-c", `filter.${driver}.process=`,
    "-c", `filter.${driver}.required=false`
  ];
}

export const getWorkspaceGitStatus = getGitStatus;

export async function getWorkspaceGitDiff(
  workspace: WorkspaceDefinition,
  requestedPath: string,
  staged: boolean,
  excludedEnvironmentKeys: string[] = []
): Promise<GitDiffResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  const path = validateGitPath(requestedPath);

  const status = await getGitStatus(workspace, excludedEnvironmentKeys);
  const untracked = !staged && status.changes.some(
    (change) => change.path === path && change.untracked
  );

  const workingTreeConfig = staged
    ? []
    : await safeWorkingTreeDiffConfig(
        workspace,
        repository.root,
        path,
        excludedEnvironmentKeys
      );
  const args = untracked
    ? [
        ...workingTreeConfig,
        "diff",
        "--no-index",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--",
        gitNullDevice(workspace),
        path
      ]
    : [
        ...workingTreeConfig,
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        ...(staged ? ["--cached"] : []),
        "--",
        path
      ];

  const result = await runWorkspaceGit(
    workspace,
    repository.root,
    args,
    excludedEnvironmentKeys,
    {
      maxStdoutBytes: GIT_DIFF_LIMIT_BYTES,
      allowExitCodes: untracked ? [0, 1] : [0],
      allowTruncated: true
    }
  );
  const diff = result.stdout.toString("utf8");

  return GitDiffResponseSchema.parse({
    path,
    staged,
    diff,
    truncated: result.stdoutTruncated,
    binary: /(?:Binary files .* differ|GIT binary patch)/.test(diff),
    snapshot: hashBytes(result.stdout)
  });
}

type GitHistoryCursor = {
  v: number;
  snapshot: string;
  offset: number;
  pathHash?: string;
};

function isGitObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40,64}$/i.test(value);
}

function gitHistoryPathHash(path: string): string {
  return createHash("sha256").update(path, "utf8").digest("hex");
}

function encodeGitHistoryCursor(cursor: GitHistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeGitHistoryCursor(
  value: string,
  requestedPath: string | undefined
): GitHistoryCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Git history cursor is invalid");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Git history cursor is invalid");
  }
  const candidate = parsed as Partial<GitHistoryCursor>;
  if (
    candidate.v !== GIT_HISTORY_CURSOR_VERSION ||
    !isGitObjectId(candidate.snapshot) ||
    !Number.isSafeInteger(candidate.offset) ||
    (candidate.offset ?? -1) < 0 ||
    (
      candidate.pathHash !== undefined &&
      (
        typeof candidate.pathHash !== "string" ||
        !/^[0-9a-f]{64}$/i.test(candidate.pathHash)
      )
    )
  ) {
    throw new Error("Git history cursor is invalid");
  }

  const requestedPathHash = requestedPath
    ? gitHistoryPathHash(requestedPath)
    : undefined;
  if (candidate.pathHash !== requestedPathHash) {
    throw new Error("Git history cursor does not match the requested path");
  }

  return {
    v: GIT_HISTORY_CURSOR_VERSION,
    snapshot: candidate.snapshot,
    offset: candidate.offset!,
    ...(candidate.pathHash ? { pathHash: candidate.pathHash } : {})
  };
}

function parseHistoryCommits(output: Buffer) {
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const [oid = "", shortOid = "", author = "", authoredAt = "", ...subject] =
        record.split("\x1f");
      return {
        oid,
        shortOid,
        author,
        authoredAt,
        subject: subject.join("\x1f")
      };
    });
}

export async function getWorkspaceGitHistory(
  workspace: WorkspaceDefinition,
  request: GitHistoryRequest,
  excludedEnvironmentKeys: string[] = []
): Promise<GitHistoryResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  const requestedPath = request.path ? validateGitPath(request.path) : undefined;

  let snapshot: string;
  let offset = 0;
  if (request.cursor) {
    const cursor = decodeGitHistoryCursor(request.cursor, requestedPath);
    snapshot = cursor.snapshot;
    offset = cursor.offset;
  } else {
    const status = await getGitStatus(workspace, excludedEnvironmentKeys);
    if (
      !status.repository ||
      status.repository.head.unborn ||
      !status.repository.head.oid
    ) {
      return GitHistoryResponseSchema.parse({
        commits: [],
        ...(requestedPath ? { path: requestedPath } : {})
      });
    }
    snapshot = status.repository.head.oid;
  }

  const result = await runWorkspaceGit(
    workspace,
    repository.root,
    [
      "log",
      "-z",
      "--no-color",
      "--date=iso-strict",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s",
      "--skip",
      String(offset),
      "-n",
      String(request.limit + 1),
      ...(requestedPath ? ["--follow"] : []),
      snapshot,
      ...(requestedPath ? ["--", requestedPath] : [])
    ],
    excludedEnvironmentKeys,
    { maxStdoutBytes: GIT_HISTORY_LIMIT_BYTES }
  );

  const parsed = parseHistoryCommits(result.stdout);
  const hasMore = parsed.length > request.limit;
  const commits = parsed.slice(0, request.limit);
  const nextCursor = hasMore
    ? encodeGitHistoryCursor({
        v: GIT_HISTORY_CURSOR_VERSION,
        snapshot,
        offset: offset + request.limit,
        ...(requestedPath ? { pathHash: gitHistoryPathHash(requestedPath) } : {})
      })
    : undefined;

  return GitHistoryResponseSchema.parse({
    commits,
    snapshot,
    ...(nextCursor ? { nextCursor } : {}),
    ...(requestedPath ? { path: requestedPath } : {})
  });
}

function gitCommitFileStatus(code: string): GitCommitFile["status"] | undefined {
  switch (code[0]) {
  case "M": return "modified";
  case "T": return "typeChanged";
  case "A": return "added";
  case "D": return "deleted";
  case "R": return "renamed";
  case "C": return "copied";
  default: return undefined;
  }
}

function parseGitCommitFiles(
  output: Buffer,
  outputTruncated: boolean
): { files: GitCommitFile[]; truncated: boolean } {
  const fields = output.toString("utf8").split("\0");
  const files: GitCommitFile[] = [];
  let index = 0;
  let malformed = false;

  while (index < fields.length) {
    let token = fields[index++] ?? "";
    if (!token) continue;

    let statusToken = token;
    let firstPath: string | undefined;
    const tab = token.indexOf("\t");
    if (tab >= 0) {
      statusToken = token.slice(0, tab);
      firstPath = token.slice(tab + 1);
    }
    const status = gitCommitFileStatus(statusToken);
    if (!status) {
      malformed = true;
      break;
    }

    if (!firstPath) firstPath = fields[index++] ?? "";
    if (!firstPath) {
      malformed = true;
      break;
    }

    try {
      if (status === "renamed" || status === "copied") {
        const secondPath = fields[index++] ?? "";
        if (!secondPath) {
          malformed = true;
          break;
        }
        files.push({
          path: validateGitPath(secondPath),
          originalPath: validateGitPath(firstPath),
          status
        });
      } else {
        files.push({
          path: validateGitPath(firstPath),
          status
        });
      }
    } catch {
      malformed = true;
      break;
    }

    if (files.length >= MAX_GIT_COMMIT_FILES) {
      return { files, truncated: true };
    }
  }

  return {
    files,
    truncated: outputTruncated || malformed
  };
}

export async function getWorkspaceGitCommit(
  workspace: WorkspaceDefinition,
  requestedOid: string,
  excludedEnvironmentKeys: string[] = []
): Promise<GitCommitDetailResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  if (!isGitObjectId(requestedOid)) throw new Error("Git commit object id is invalid");

  const metadata = await runWorkspaceGit(
    workspace,
    repository.root,
    [
      "show",
      "-s",
      "--no-color",
      "--date=iso-strict",
      "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%b%x00%P%x00",
      requestedOid
    ],
    excludedEnvironmentKeys,
    { maxStdoutBytes: GIT_COMMIT_DETAIL_LIMIT_BYTES }
  );
  const fields = metadata.stdout.toString("utf8").split("\0");
  const [
    oid = "",
    shortOid = "",
    author = "",
    email = "",
    authoredAt = "",
    subject = "",
    rawBody = "",
    parentField = ""
  ] = fields;
  if (!isGitObjectId(oid) || oid.toLowerCase() !== requestedOid.toLowerCase()) {
    throw new Error("Git commit metadata is invalid");
  }

  const bodyLimit = 256 * 1024;
  const bodyTruncated = rawBody.length > bodyLimit;
  const body = rawBody.slice(0, bodyLimit);
  const parents = parentField
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parents.some((parent) => !isGitObjectId(parent))) {
    throw new Error("Git commit parent metadata is invalid");
  }

  const changed = await runWorkspaceGit(
    workspace,
    repository.root,
    [
      "diff-tree",
      "--root",
      "--no-commit-id",
      "--name-status",
      "-r",
      "-z",
      "-M",
      "-C",
      requestedOid
    ],
    excludedEnvironmentKeys,
    {
      maxStdoutBytes: GIT_COMMIT_FILES_LIMIT_BYTES,
      allowTruncated: true
    }
  );
  const parsedFiles = parseGitCommitFiles(
    changed.stdout,
    changed.stdoutTruncated
  );

  return GitCommitDetailResponseSchema.parse({
    oid,
    shortOid,
    author,
    email,
    authoredAt,
    subject,
    body,
    parents,
    files: parsedFiles.files,
    truncated: bodyTruncated || parsedFiles.truncated
  });
}

export async function getWorkspaceGitCommitDiff(
  workspace: WorkspaceDefinition,
  requestedOid: string,
  requestedPath: string,
  excludedEnvironmentKeys: string[] = []
): Promise<GitCommitDiffResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  if (!isGitObjectId(requestedOid)) throw new Error("Git commit object id is invalid");
  const path = validateGitPath(requestedPath);

  const result = await runWorkspaceGit(
    workspace,
    repository.root,
    [
      "show",
      "--format=",
      "--no-ext-diff",
      "--no-textconv",
      "--no-color",
      requestedOid,
      "--",
      path
    ],
    excludedEnvironmentKeys,
    {
      maxStdoutBytes: GIT_DIFF_LIMIT_BYTES,
      allowTruncated: true
    }
  );
  const diff = result.stdout.toString("utf8");

  return GitCommitDiffResponseSchema.parse({
    oid: requestedOid,
    path,
    diff,
    truncated: result.stdoutTruncated,
    binary: /(?:Binary files .* differ|GIT binary patch)/.test(diff)
  });
}

export async function getWorkspaceGitBranches(
  workspace: WorkspaceDefinition,
  excludedEnvironmentKeys: string[] = []
): Promise<GitBranchesResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  const result = await runWorkspaceGit(
    workspace,
    repository.root,
    [
      "for-each-ref",
      "--sort=refname",
      "--format=%(refname:short)%00%(objectname)%00%(upstream:short)%00%(HEAD)",
      "refs/heads"
    ],
    excludedEnvironmentKeys,
    {
      maxStdoutBytes: GIT_BRANCH_LIMIT_BYTES,
      allowTruncated: true
    }
  );

  const output = result.stdout.toString("utf8");
  const allLines = output.split(/\r?\n/).filter(Boolean);
  const lines = result.stdoutTruncated && !/\r?\n$/.test(output)
    ? allLines.slice(0, -1)
    : allLines;
  const branches: Array<{
    name: string;
    oid: string;
    upstream?: string;
    current: boolean;
  }> = [];
  let malformed = false;

  for (const line of lines.slice(0, MAX_GIT_BRANCHES)) {
    const [name = "", oid = "", upstream = "", current = ""] = line.split("\0");
    if (!name || !/^[0-9a-f]{40,64}$/i.test(oid)) {
      malformed = true;
      continue;
    }
    branches.push({
      name,
      oid,
      ...(upstream ? { upstream } : {}),
      current: current.trim() === "*"
    });
  }

  return GitBranchesResponseSchema.parse({
    branches,
    truncated:
      result.stdoutTruncated ||
      malformed ||
      lines.length > MAX_GIT_BRANCHES
  });
}

async function validateBranchName(
  workspace: WorkspaceDefinition,
  root: string,
  name: string,
  excludedEnvironmentKeys: string[]
): Promise<void> {
  await runWorkspaceGit(
    workspace,
    root,
    ["check-ref-format", "--branch", name],
    excludedEnvironmentKeys,
    { maxStdoutBytes: 32 * 1024 }
  );
}

async function runMutationCommand(
  workspace: WorkspaceDefinition,
  root: string,
  args: string[],
  excludedEnvironmentKeys: string[]
): Promise<void> {
  await runWorkspaceGit(
    workspace,
    root,
    args,
    excludedEnvironmentKeys,
    {
      maxStdoutBytes: 512 * 1024,
      timeoutMs: 30_000
    }
  );
}

export async function mutateWorkspaceGit(
  workspace: WorkspaceDefinition,
  request: GitMutationRequest,
  excludedEnvironmentKeys: string[] = []
): Promise<GitMutationResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  return serializedRepositoryWrite(workspace, repository.root, async () => {
    const before = await requireExpectedGitState(
      workspace,
      request.expectedState,
      excludedEnvironmentKeys
    );
    if (!before.repository || before.repository.root !== repository.root) {
      throw new GitStateChangedError();
    }
    const root = before.repository.root;

    switch (request.operation.type) {
    case "stage": {
      const paths = validateGitPaths(request.operation.paths);
      await runMutationCommand(
        workspace,
        root,
        ["add", "--", ...paths],
        excludedEnvironmentKeys
      );
      break;
    }
    case "unstage": {
      const paths = validateGitPaths(request.operation.paths);
      await runMutationCommand(
        workspace,
        root,
        before.repository.head.unborn
          ? ["rm", "--cached", "--ignore-unmatch", "--", ...paths]
          : ["restore", "--staged", "--", ...paths],
        excludedEnvironmentKeys
      );
      break;
    }
    case "stage.all": {
      await runMutationCommand(
        workspace,
        root,
        ["add", "-A", "--", "."],
        excludedEnvironmentKeys
      );
      break;
    }
    case "unstage.all": {
      await runMutationCommand(
        workspace,
        root,
        before.repository.head.unborn
          ? ["rm", "-r", "--cached", "--ignore-unmatch", "--", "."]
          : ["restore", "--staged", "--", "."],
        excludedEnvironmentKeys
      );
      break;
    }
    case "restore": {
      const path = validateGitPath(request.operation.path);
      const currentDiff = await getWorkspaceGitDiff(
        workspace,
        path,
        false,
        excludedEnvironmentKeys
      );
      if (currentDiff.truncated) {
        throw new Error("Refusing to restore a file whose diff exceeds the preview limit");
      }
      if (currentDiff.snapshot !== request.operation.diffSnapshot) {
        throw new GitStateChangedError(
          "The selected file changed since its diff was loaded"
        );
      }
      await runMutationCommand(
        workspace,
        root,
        ["restore", "--worktree", "--", path],
        excludedEnvironmentKeys
      );
      break;
    }
    case "commit": {
      await runMutationCommand(
        workspace,
        root,
        [
          ...disabledHooksArgs(workspace),
          "commit",
          "--no-verify",
          "--no-gpg-sign",
          "-m",
          request.operation.message
        ],
        excludedEnvironmentKeys
      );
      break;
    }
    case "branch.create": {
      await validateBranchName(
        workspace,
        root,
        request.operation.name,
        excludedEnvironmentKeys
      );
      await runMutationCommand(
        workspace,
        root,
        [
          ...disabledHooksArgs(workspace),
          "switch",
          "-c",
          request.operation.name
        ],
        excludedEnvironmentKeys
      );
      break;
    }
    case "branch.switch": {
      await validateBranchName(
        workspace,
        root,
        request.operation.name,
        excludedEnvironmentKeys
      );
      await runMutationCommand(
        workspace,
        root,
        [
          ...disabledHooksArgs(workspace),
          "switch",
          request.operation.name
        ],
        excludedEnvironmentKeys
      );
      break;
    }
    case "stash.push": {
      await runMutationCommand(
        workspace,
        root,
        [
          ...disabledHooksArgs(workspace),
          "stash",
          "push",
          ...(request.operation.includeUntracked ? ["--include-untracked"] : []),
          "-m",
          "PalmTTY stash"
        ],
        excludedEnvironmentKeys
      );
      break;
    }
    case "stash.pop": {
      await runMutationCommand(
        workspace,
        root,
        [...disabledHooksArgs(workspace), "stash", "pop"],
        excludedEnvironmentKeys
      );
      break;
    }
    }

    return GitMutationResponseSchema.parse({
      status: await getGitStatus(workspace, excludedEnvironmentKeys)
    });
  });
}

export async function runWorkspaceGitRemote(
  workspace: WorkspaceDefinition,
  request: GitRemoteRequest,
  excludedEnvironmentKeys: string[] = []
): Promise<GitRemoteResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  return serializedRepositoryWrite(workspace, repository.root, async () => {
    const before = await requireExpectedGitState(
      workspace,
      request.expectedState,
      excludedEnvironmentKeys
    );
    if (!before.repository || before.repository.root !== repository.root) {
      throw new GitStateChangedError();
    }

    const command = request.operation === "fetch"
      ? ["fetch", "--prune"]
      : request.operation === "pull"
        ? ["pull", "--ff-only"]
        : ["push"];

    await runWorkspaceGit(
      workspace,
      before.repository.root,
      [
        ...disabledHooksArgs(workspace),
        ...SAFE_REMOTE_PROTOCOL_ARGS,
        ...command
      ],
      excludedEnvironmentKeys,
      {
        maxStdoutBytes: GIT_REMOTE_LIMIT_BYTES,
        timeoutMs: 60_000
      }
    );

    return GitRemoteResponseSchema.parse({
      status: await getGitStatus(workspace, excludedEnvironmentKeys)
    });
  });
}
