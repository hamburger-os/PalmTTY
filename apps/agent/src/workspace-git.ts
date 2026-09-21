import {
  GitDiffResponseSchema,
  GitStatusResponseSchema,
  type GitDiffResponse,
  type GitStatusEntry,
  type GitStatusResponse,
  type WorkspaceDefinition
} from "@palmtty/protocol";
import {
  readHostEnvironment,
  withoutEnvironmentKeys
} from "./host-environment.js";
import { runBoundedProcess } from "./bounded-process.js";
import { resolveExecutable } from "./workspace-runtime.js";

const STATUS_LIMIT_BYTES = 1024 * 1024;
const DIFF_LIMIT_BYTES = 1024 * 1024;
const MAX_STATUS_ENTRIES = 2048;

const GIT_BASE_ARGS = [
  "-c", "core.quotepath=false",
  "-c", "color.ui=false",
  "-c", "core.pager=cat",
  "-c", "core.fsmonitor=false"
];

const GIT_REPOSITORY_ENV_KEYS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_SYSTEM",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
  "GIT_CONFIG_COUNT"
];

function gitHostEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string>,
  excludedEnvironmentKeys: string[]
): Record<string, string> {
  const environment = withoutEnvironmentKeys(source, [
    ...excludedEnvironmentKeys,
    ...GIT_REPOSITORY_ENV_KEYS
  ]);
  for (const key of Object.keys(environment)) {
    if (/^GIT_CONFIG_(?:KEY|VALUE)_\d+$/i.test(key)) {
      delete environment[key];
    }
  }
  environment.GIT_TERMINAL_PROMPT = "0";
  environment.GIT_PAGER = "cat";
  environment.GIT_OPTIONAL_LOCKS = "0";
  return environment;
}

function wslPrefix(workspace: WorkspaceDefinition): string[] {
  if (workspace.runtime.kind !== "wsl") {
    throw new Error("Workspace is not a WSL runtime");
  }
  return workspace.runtime.distribution
    ? ["--distribution", workspace.runtime.distribution]
    : [];
}

async function runGit(
  workspace: WorkspaceDefinition,
  cwd: string,
  args: string[],
  maxStdoutBytes: number,
  excludedEnvironmentKeys: string[]
) {
  if (workspace.runtime.kind === "wsl") {
    if (process.platform !== "win32") {
      throw new Error("WSL Git integration is available only on Windows");
    }
    const environment = gitHostEnvironment(
      await readHostEnvironment(),
      excludedEnvironmentKeys
    );
    const executable = await resolveExecutable("wsl.exe", {
      cwd: process.cwd(),
      env: environment
    });
    return runBoundedProcess({
      executable,
      args: [
        ...wslPrefix(workspace),
        "--cd",
        cwd,
        "--exec",
        "/usr/bin/env",
        ...GIT_REPOSITORY_ENV_KEYS.flatMap((key) => ["-u", key]),
        "GIT_TERMINAL_PROMPT=0",
        "GIT_PAGER=cat",
        "GIT_OPTIONAL_LOCKS=0",
        "git",
        ...GIT_BASE_ARGS,
        ...args
      ],
      env: environment,
      cwd: process.cwd(),
      maxStdoutBytes,
      timeoutMs: 10_000
    });
  }

  const hostEnvironment = gitHostEnvironment(
    await readHostEnvironment(),
    excludedEnvironmentKeys
  );
  const executable = await resolveExecutable("git", {
    cwd: workspace.cwd,
    env: hostEnvironment
  });
  return runBoundedProcess({
    executable,
    args: [...GIT_BASE_ARGS, ...args],
    cwd,
    env: hostEnvironment,
    maxStdoutBytes,
    timeoutMs: 10_000
  });
}

async function discoverRepositoryRoot(
  workspace: WorkspaceDefinition,
  excludedEnvironmentKeys: string[]
): Promise<string | null> {
  const result = await runGit(
    workspace,
    workspace.cwd,
    ["rev-parse", "--show-toplevel"],
    32 * 1024,
    excludedEnvironmentKeys
  );
  if (result.code !== 0 || result.stdoutTruncated) return null;
  const root = result.stdout.toString("utf8").trim();
  return root || null;
}

function parseBranchHeader(header: string): {
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
} {
  let value = header.startsWith("## ") ? header.slice(3) : header;
  if (value.startsWith("No commits yet on ")) {
    return {
      branch: value.slice("No commits yet on ".length),
      ahead: 0,
      behind: 0
    };
  }
  if (value.startsWith("Initial commit on ")) {
    return {
      branch: value.slice("Initial commit on ".length),
      ahead: 0,
      behind: 0
    };
  }

  let ahead = 0;
  let behind = 0;
  const trackingIndex = value.indexOf("...");
  if (trackingIndex === -1) {
    return { branch: value || undefined, ahead, behind };
  }

  const branch = value.slice(0, trackingIndex);
  const tracking = value.slice(trackingIndex + 3);
  const metadataIndex = tracking.indexOf(" [");
  const upstream = metadataIndex === -1
    ? tracking
    : tracking.slice(0, metadataIndex);
  const metadata = metadataIndex === -1 ? "" : tracking.slice(metadataIndex + 2, -1);
  for (const item of metadata.split(", ")) {
    if (item.startsWith("ahead ")) {
      ahead = Number.parseInt(item.slice(6), 10) || 0;
    } else if (item.startsWith("behind ")) {
      behind = Number.parseInt(item.slice(7), 10) || 0;
    }
  }

  return {
    branch: branch || undefined,
    upstream: upstream || undefined,
    ahead,
    behind
  };
}

function parseStatus(
  source: string,
  stdoutTruncated: boolean
): Omit<GitStatusResponse, "available" | "root"> {
  const records = source.split("\0");
  const first = records[0] ?? "";
  const branch = parseBranchHeader(first);
  const entries: GitStatusEntry[] = [];
  let truncated = stdoutTruncated;

  for (let index = first.startsWith("## ") ? 1 : 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
    if (entries.length >= MAX_STATUS_ENTRIES) {
      truncated = true;
      break;
    }

    const status = record.slice(0, 2);
    const rawPath = record.slice(3);
    if (!rawPath) continue;
    const indexState = status[0] ?? " ";
    const worktreeState = status[1] ?? " ";
    const renamed = indexState === "R" || indexState === "C" ||
      worktreeState === "R" || worktreeState === "C";
    const rawOriginalPath = renamed ? records[index + 1] : undefined;
    if (renamed) index += 1;

    let gitPath: string;
    let originalPath: string | undefined;
    try {
      gitPath = validateGitPath(rawPath);
      originalPath = rawOriginalPath
        ? validateGitPath(rawOriginalPath)
        : undefined;
    } catch {
      truncated = true;
      continue;
    }

    const untracked = status === "??";
    entries.push({
      path: gitPath,
      ...(originalPath ? { originalPath } : {}),
      index: indexState,
      worktree: worktreeState,
      staged: !untracked && indexState !== " ",
      unstaged: untracked || worktreeState !== " ",
      untracked
    });
  }

  return {
    ...branch,
    entries,
    truncated
  };
}

function validateGitPath(value: string): string {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((part) => part === "." || part === ".." || part.length === 0)
  ) {
    throw new Error("Git path must be a canonical repository-relative path");
  }
  return value;
}

export async function getWorkspaceGitStatus(
  workspace: WorkspaceDefinition,
  excludedEnvironmentKeys: string[] = []
): Promise<GitStatusResponse> {
  const root = await discoverRepositoryRoot(workspace, excludedEnvironmentKeys);
  if (!root) {
    return GitStatusResponseSchema.parse({
      available: false,
      ahead: 0,
      behind: 0,
      entries: [],
      truncated: false
    });
  }

  const result = await runGit(
    workspace,
    root,
    ["status", "--porcelain=v1", "-z", "-b", "--untracked-files=normal"],
    STATUS_LIMIT_BYTES,
    excludedEnvironmentKeys
  );
  if (result.code !== 0 && !result.stdoutTruncated) {
    throw new Error(result.stderr.trim() || "Git status failed");
  }

  return GitStatusResponseSchema.parse({
    available: true,
    root,
    ...parseStatus(result.stdout.toString("utf8"), result.stdoutTruncated)
  });
}

export async function getWorkspaceGitDiff(
  workspace: WorkspaceDefinition,
  requestedPath: string,
  staged: boolean,
  excludedEnvironmentKeys: string[] = []
): Promise<GitDiffResponse> {
  const root = await discoverRepositoryRoot(workspace, excludedEnvironmentKeys);
  if (!root) throw new Error("Workspace is not inside a Git repository");
  const gitPath = validateGitPath(requestedPath);

  const result = await runGit(
    workspace,
    root,
    [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-color",
      ...(staged ? ["--cached"] : []),
      "--",
      gitPath
    ],
    DIFF_LIMIT_BYTES,
    excludedEnvironmentKeys
  );
  if (result.code !== 0 && !result.stdoutTruncated) {
    throw new Error(result.stderr.trim() || "Git diff failed");
  }

  return GitDiffResponseSchema.parse({
    path: gitPath,
    staged,
    diff: result.stdout.toString("utf8"),
    truncated: result.stdoutTruncated
  });
}
