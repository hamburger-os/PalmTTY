import { createHash } from "node:crypto";
import {
  GitStatusResponseSchema,
  type GitChange,
  type GitChangeKind,
  type GitFileStatus,
  type GitRepositoryContext,
  type GitStatusResponse,
  type WorkspaceDefinition
} from "@palmtty/protocol";
import {
  GIT_STATUS_LIMIT_BYTES,
  MAX_GIT_STATUS_ENTRIES,
  discoverGitRepository,
  runWorkspaceGit,
  validateGitPath
} from "./runner.js";

function statusName(value: string): GitFileStatus | undefined {
  switch (value) {
    case "M": return "modified";
    case "T": return "typeChanged";
    case "A": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    case "U": return "unmerged";
    case ".": return undefined;
    default: return undefined;
  }
}

function changeKind(
  indexStatus: GitFileStatus | undefined,
  worktreeStatus: GitFileStatus | undefined,
  conflict: boolean,
  submodule: boolean
): GitChangeKind {
  if (conflict) return "conflict";
  if (submodule) return "submodule";
  return worktreeStatus ?? indexStatus ?? "modified";
}

function splitFixed(
  value: string,
  fixedFields: number
): { fields: string[]; remainder: string } {
  const fields: string[] = [];
  let offset = 0;
  for (let index = 0; index < fixedFields; index += 1) {
    const separator = value.indexOf(" ", offset);
    if (separator === -1) {
      throw new Error("Git porcelain record is incomplete");
    }
    fields.push(value.slice(offset, separator));
    offset = separator + 1;
  }
  return { fields, remainder: value.slice(offset) };
}

function parseTrackedRecord(record: string): GitChange {
  const { fields, remainder } = splitFixed(record, 8);
  const [, xy, submodule] = fields;
  const path = validateGitPath(remainder);
  const indexStatus = statusName(xy?.[0] ?? ".");
  const worktreeStatus = statusName(xy?.[1] ?? ".");
  const conflict = indexStatus === "unmerged" || worktreeStatus === "unmerged";
  const isSubmodule = Boolean(submodule && submodule !== "N...");

  return {
    path,
    kind: changeKind(indexStatus, worktreeStatus, conflict, isSubmodule),
    ...(indexStatus ? { indexStatus } : {}),
    ...(worktreeStatus ? { worktreeStatus } : {}),
    staged: Boolean(indexStatus),
    unstaged: Boolean(worktreeStatus),
    untracked: false,
    conflict
  };
}

function parseRenameRecord(record: string, originalRecord: string | undefined): GitChange {
  const { fields, remainder } = splitFixed(record, 9);
  const [, xy, submodule] = fields;
  const path = validateGitPath(remainder);
  const originalPath = validateGitPath(originalRecord ?? "");
  const indexStatus = statusName(xy?.[0] ?? ".");
  const worktreeStatus = statusName(xy?.[1] ?? ".");
  const conflict = indexStatus === "unmerged" || worktreeStatus === "unmerged";
  const isSubmodule = Boolean(submodule && submodule !== "N...");

  return {
    path,
    originalPath,
    kind: changeKind(indexStatus, worktreeStatus, conflict, isSubmodule),
    ...(indexStatus ? { indexStatus } : {}),
    ...(worktreeStatus ? { worktreeStatus } : {}),
    staged: Boolean(indexStatus),
    unstaged: Boolean(worktreeStatus),
    untracked: false,
    conflict
  };
}

function parseUnmergedRecord(record: string): GitChange {
  const { remainder } = splitFixed(record, 10);
  const path = validateGitPath(remainder);
  return {
    path,
    kind: "conflict",
    indexStatus: "unmerged",
    worktreeStatus: "unmerged",
    staged: true,
    unstaged: true,
    untracked: false,
    conflict: true
  };
}

function stateToken(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function parsePorcelainV2Status(
  source: string,
  repository: { root: string; workspacePath: string },
  stdoutTruncated: boolean
): GitStatusResponse {
  const records = source.split("\0");
  const changes: GitChange[] = [];
  let branch: string | undefined;
  let oid: string | undefined;
  let detached = false;
  let unborn = false;
  let upstream: string | undefined;
  let ahead = 0;
  let behind = 0;
  let truncated = stdoutTruncated;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;

    if (record.startsWith("# ")) {
      if (record.startsWith("# branch.oid ")) {
        const value = record.slice("# branch.oid ".length);
        unborn = value === "(initial)";
        if (!unborn && value) oid = value;
      } else if (record.startsWith("# branch.head ")) {
        const value = record.slice("# branch.head ".length);
        detached = value === "(detached)";
        if (!detached && value) branch = value;
      } else if (record.startsWith("# branch.upstream ")) {
        const value = record.slice("# branch.upstream ".length);
        if (value) upstream = value;
      } else if (record.startsWith("# branch.ab ")) {
        const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record);
        if (match) {
          ahead = Number.parseInt(match[1] ?? "0", 10);
          behind = Number.parseInt(match[2] ?? "0", 10);
        }
      }
      continue;
    }

    if (changes.length >= MAX_GIT_STATUS_ENTRIES) {
      truncated = true;
      break;
    }

    try {
      if (record.startsWith("1 ")) {
        changes.push(parseTrackedRecord(record));
      } else if (record.startsWith("2 ")) {
        changes.push(parseRenameRecord(record, records[index + 1]));
        index += 1;
      } else if (record.startsWith("u ")) {
        changes.push(parseUnmergedRecord(record));
      } else if (record.startsWith("? ")) {
        changes.push({
          path: validateGitPath(record.slice(2)),
          kind: "untracked",
          staged: false,
          unstaged: true,
          untracked: true,
          conflict: false
        });
      }
    } catch {
      truncated = true;
    }
  }

  const context: GitRepositoryContext = {
    root: repository.root,
    workspacePath: repository.workspacePath,
    scope: "repository",
    head: {
      ...(oid ? { oid } : {}),
      ...(branch ? { branch } : {}),
      detached,
      unborn
    },
    ...(upstream ? { upstream } : {}),
    ahead,
    behind,
    stateToken: stateToken(source)
  };

  return GitStatusResponseSchema.parse({
    available: true,
    repository: context,
    changes,
    truncated
  });
}

export async function getGitStatus(
  workspace: WorkspaceDefinition,
  excludedEnvironmentKeys: string[] = []
): Promise<GitStatusResponse> {
  const repository = await discoverGitRepository(workspace, excludedEnvironmentKeys);
  if (!repository) {
    return GitStatusResponseSchema.parse({
      available: false,
      changes: [],
      truncated: false
    });
  }

  const result = await runWorkspaceGit(
    workspace,
    repository.root,
    ["status", "--porcelain=v2", "-z", "--branch", "--untracked-files=normal"],
    excludedEnvironmentKeys,
    {
      maxStdoutBytes: GIT_STATUS_LIMIT_BYTES,
      allowTruncated: true
    }
  );

  return parsePorcelainV2Status(
    result.stdout.toString("utf8"),
    repository,
    result.stdoutTruncated
  );
}

export async function requireExpectedGitState(
  workspace: WorkspaceDefinition,
  expectedState: string,
  excludedEnvironmentKeys: string[] = []
): Promise<GitStatusResponse> {
  const status = await getGitStatus(workspace, excludedEnvironmentKeys);
  if (!status.available || !status.repository) {
    throw new Error("Workspace is not inside a Git repository");
  }
  if (status.repository.stateToken !== expectedState) {
    const error = new Error("Git repository changed since the page was refreshed");
    error.name = "GitStateChangedError";
    throw error;
  }
  return status;
}
