import { createHash } from "node:crypto";
import {
  GitBranchesResponseSchema,
  GitDiffResponseSchema,
  GitHistoryResponseSchema,
  GitMutationResponseSchema,
  GitRemoteResponseSchema,
  type GitBranchesResponse,
  type GitDiffResponse,
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
import {
  getGitStatus,
  requireExpectedGitState
} from "./status.js";

const GIT_REMOTE_LIMIT_BYTES = 512 * 1024;

export class GitStateChangedError extends Error {
  constructor(message = "Git repository changed since the page was refreshed") {
    super(message);
    this.name = "GitStateChangedError";
  }
}

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

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

  const args = untracked
    ? [
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
    snapshot: hashText(diff)
  });
}

export async function getWorkspaceGitHistory(
  workspace: WorkspaceDefinition,
  limit: number,
  excludedEnvironmentKeys: string[] = []
): Promise<GitHistoryResponse> {
  const repository = await requireRepository(workspace, excludedEnvironmentKeys);
  const status = await getGitStatus(workspace, excludedEnvironmentKeys);
  if (!status.repository || status.repository.head.unborn) {
    return GitHistoryResponseSchema.parse({ commits: [] });
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
      "-n",
      String(limit)
    ],
    excludedEnvironmentKeys,
    { maxStdoutBytes: GIT_HISTORY_LIMIT_BYTES }
  );

  const commits = result.stdout
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

  return GitHistoryResponseSchema.parse({ commits });
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

  const lines = result.stdout.toString("utf8").split(/\r?\n/).filter(Boolean);
  const branches = lines.slice(0, MAX_GIT_BRANCHES).map((line) => {
    const [name = "", oid = "", upstream = "", current = ""] = line.split("\0");
    return {
      name,
      oid,
      ...(upstream ? { upstream } : {}),
      current: current.trim() === "*"
    };
  });

  return GitBranchesResponseSchema.parse({
    branches,
    truncated: result.stdoutTruncated || lines.length > MAX_GIT_BRANCHES
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
  const before = await requireExpectedGitState(
    workspace,
    request.expectedState,
    excludedEnvironmentKeys
  );
  if (!before.repository) {
    throw new Error("Workspace is not inside a Git repository");
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
          ...(request.operation.amend ? ["--amend"] : []),
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
}

export async function runWorkspaceGitRemote(
  workspace: WorkspaceDefinition,
  request: GitRemoteRequest,
  excludedEnvironmentKeys: string[] = []
): Promise<GitRemoteResponse> {
  const before = await requireExpectedGitState(
    workspace,
    request.expectedState,
    excludedEnvironmentKeys
  );
  if (!before.repository) {
    throw new Error("Workspace is not inside a Git repository");
  }

  const command = request.operation === "fetch"
    ? ["fetch", "--prune"]
    : request.operation === "pull"
      ? ["pull", "--ff-only"]
      : ["push"];

  await runWorkspaceGit(
    workspace,
    before.repository.root,
    [...disabledHooksArgs(workspace), ...command],
    excludedEnvironmentKeys,
    {
      maxStdoutBytes: GIT_REMOTE_LIMIT_BYTES,
      timeoutMs: 60_000
    }
  );

  return GitRemoteResponseSchema.parse({
    status: await getGitStatus(workspace, excludedEnvironmentKeys)
  });
}
