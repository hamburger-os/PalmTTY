import type { WorkspaceDefinition } from "@palmtty/protocol";
import {
  readHostEnvironment,
  withoutEnvironmentKeys
} from "../host-environment.js";
import {
  runBoundedProcess,
  type BoundedProcessResult
} from "../bounded-process.js";
import { resolveExecutable } from "../workspace-runtime.js";

export const GIT_STATUS_LIMIT_BYTES = 1024 * 1024;
export const GIT_DIFF_LIMIT_BYTES = 1024 * 1024;
export const GIT_HISTORY_LIMIT_BYTES = 512 * 1024;
export const GIT_BRANCH_LIMIT_BYTES = 512 * 1024;
export const MAX_GIT_STATUS_ENTRIES = 2048;
export const MAX_GIT_BRANCHES = 256;

const GIT_BASE_ARGS = [
  "-c", "core.quotepath=false",
  "-c", "color.ui=false",
  "-c", "core.pager=cat",
  "-c", "core.fsmonitor=false",
  "-c", "log.showSignature=false"
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
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_EXEC_PATH",
  "GIT_ASKPASS",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "SSH_ASKPASS",
  "SSH_ASKPASS_REQUIRE",
  "GCM_INTERACTIVE"
];

function gitHostEnvironment(
  source: Record<string, string>,
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
  environment.GIT_EDITOR = "true";
  environment.GCM_INTERACTIVE = "never";
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

export function disabledHooksArgs(workspace: WorkspaceDefinition): string[] {
  return [
    "-c",
    workspace.runtime.kind === "wsl" || process.platform !== "win32"
      ? "core.hooksPath=/dev/null"
      : "core.hooksPath=NUL"
  ];
}

export function gitNullDevice(workspace: WorkspaceDefinition): string {
  if (workspace.runtime.kind === "wsl" || process.platform !== "win32") {
    return "/dev/null";
  }
  return "NUL";
}

export async function runWorkspaceGit(
  workspace: WorkspaceDefinition,
  cwd: string,
  args: string[],
  excludedEnvironmentKeys: string[] = [],
  options: {
    maxStdoutBytes?: number;
    timeoutMs?: number;
    allowExitCodes?: number[];
    allowTruncated?: boolean;
  } = {}
): Promise<BoundedProcessResult> {
  const maxStdoutBytes = options.maxStdoutBytes ?? GIT_STATUS_LIMIT_BYTES;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const allowExitCodes = options.allowExitCodes ?? [0];
  const allowTruncated = options.allowTruncated ?? false;

  let result: BoundedProcessResult;
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
    result = await runBoundedProcess({
      executable,
      args: [
        ...wslPrefix(workspace),
        "--cd",
        cwd,
        "--exec",
        "/usr/bin/env",
        ...excludedEnvironmentKeys.flatMap((key) => ["-u", key]),
        ...GIT_REPOSITORY_ENV_KEYS.flatMap((key) => ["-u", key]),
        "GIT_TERMINAL_PROMPT=0",
        "GIT_PAGER=cat",
        "GIT_OPTIONAL_LOCKS=0",
        "GIT_EDITOR=true",
        "GCM_INTERACTIVE=never",
        "git",
        ...GIT_BASE_ARGS,
        ...args
      ],
      env: environment,
      cwd: process.cwd(),
      maxStdoutBytes,
      timeoutMs
    });
  } else {
    const environment = gitHostEnvironment(
      await readHostEnvironment(),
      excludedEnvironmentKeys
    );
    const executable = await resolveExecutable("git", {
      cwd: workspace.cwd,
      env: environment
    });
    result = await runBoundedProcess({
      executable,
      args: [...GIT_BASE_ARGS, ...args],
      cwd,
      env: environment,
      maxStdoutBytes,
      timeoutMs
    });
  }

  if (
    (!allowTruncated && result.stdoutTruncated) ||
    (result.code !== null && !allowExitCodes.includes(result.code))
  ) {
    const detail = result.stderr.trim();
    throw new Error(
      detail ||
      (result.stdoutTruncated
        ? "Git output exceeded the configured limit"
        : `Git exited with code ${result.code ?? "unknown"}`)
    );
  }
  return result;
}

export async function discoverGitRepository(
  workspace: WorkspaceDefinition,
  excludedEnvironmentKeys: string[] = []
): Promise<{ root: string; workspacePath: string } | null> {
  const rootResult = await runWorkspaceGit(
    workspace,
    workspace.cwd,
    ["rev-parse", "--show-toplevel"],
    excludedEnvironmentKeys,
    { maxStdoutBytes: 32 * 1024, allowExitCodes: [0, 128] }
  );
  if (rootResult.code !== 0) return null;
  const root = rootResult.stdout.toString("utf8").trim();
  if (!root) return null;

  const prefixResult = await runWorkspaceGit(
    workspace,
    workspace.cwd,
    ["rev-parse", "--show-prefix"],
    excludedEnvironmentKeys,
    { maxStdoutBytes: 32 * 1024 }
  );
  const workspacePath = prefixResult.stdout
    .toString("utf8")
    .trim()
    .replace(/\/$/, "");

  if (workspacePath) validateGitPath(workspacePath);
  return { root, workspacePath };
}

export function validateGitPath(value: string): string {
  if (
    value.length === 0 ||
    value.length > 4096 ||
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

export function validateGitPaths(values: string[]): string[] {
  if (values.length === 0 || values.length > 128) {
    throw new Error("Git operation requires between 1 and 128 paths");
  }
  return values.map(validateGitPath);
}
