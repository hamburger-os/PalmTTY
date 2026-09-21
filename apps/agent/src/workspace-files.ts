import { lstat, open, opendir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  WorkspaceFileListResponseSchema,
  WorkspaceFileReadResponseSchema,
  type WorkspaceDefinition,
  type WorkspaceFileEntry,
  type WorkspaceFileListResponse,
  type WorkspaceFileReadResponse
} from "@palmtty/protocol";
import { readHostEnvironment, withoutEnvironmentKeys } from "./host-environment.js";
import { runBoundedProcess } from "./bounded-process.js";
import { resolveExecutable } from "./workspace-runtime.js";

const MAX_ENTRIES = 512;
const MAX_FILE_BYTES = 512 * 1024;
const PROCESS_TIMEOUT_MS = 8_000;

export function normalizeWorkspaceRelativePath(value: string): string {
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  ) {
    throw new Error("Workspace path must be a canonical relative path");
  }
  if (value === "") return "";
  const parts = value.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error("Workspace path contains an invalid segment");
  }
  return parts.join("/");
}

function relativeParent(value: string): string | null {
  if (!value) return null;
  const index = value.lastIndexOf("/");
  return index === -1 ? "" : value.slice(0, index);
}

function childRelativePath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function resolveHostTarget(
  workspace: WorkspaceDefinition,
  relativePath: string
): Promise<{ root: string; target: string }> {
  const root = await realpath(workspace.cwd);
  const candidate = path.join(root, ...relativePath.split("/").filter(Boolean));
  const target = await realpath(candidate);
  if (!isWithin(root, target)) {
    throw new Error("Workspace path escapes the workspace root");
  }
  return { root, target };
}

async function listHostFiles(
  workspace: WorkspaceDefinition,
  relativePath: string
): Promise<WorkspaceFileListResponse> {
  const { root, target } = await resolveHostTarget(workspace, relativePath);
  if (!(await stat(target)).isDirectory()) {
    throw new Error("Workspace path is not a directory");
  }

  const directory = await opendir(target);
  const entries: WorkspaceFileEntry[] = [];
  let truncated = false;

  for await (const entry of directory) {
    if (entries.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }

    const candidate = path.join(target, entry.name);
    let info;
    try {
      if (entry.isSymbolicLink()) {
        const resolved = await realpath(candidate);
        if (!isWithin(root, resolved)) continue;
        info = await stat(resolved);
      } else {
        info = await lstat(candidate);
      }
    } catch {
      continue;
    }

    if (!info.isDirectory() && !info.isFile()) continue;
    entries.push({
      name: entry.name,
      path: childRelativePath(relativePath, entry.name),
      kind: info.isDirectory() ? "directory" : "file",
      ...(info.isFile() ? { size: info.size } : {})
    });
  }

  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });

  return WorkspaceFileListResponseSchema.parse({
    path: relativePath,
    parentPath: relativeParent(relativePath),
    entries,
    truncated
  });
}

function decodeText(buffer: Buffer): { binary: boolean; content: string } {
  if (buffer.includes(0)) return { binary: true, content: "" };
  try {
    return {
      binary: false,
      content: new TextDecoder("utf-8", { fatal: true }).decode(buffer)
    };
  } catch {
    return { binary: true, content: "" };
  }
}

async function readHostFile(
  workspace: WorkspaceDefinition,
  relativePath: string
): Promise<WorkspaceFileReadResponse> {
  const { target } = await resolveHostTarget(workspace, relativePath);
  const info = await stat(target);
  if (!info.isFile()) throw new Error("Workspace path is not a file");

  const handle = await open(target, "r");
  try {
    const requested = Math.min(info.size, MAX_FILE_BYTES + 1);
    const buffer = Buffer.alloc(requested);
    const { bytesRead } = await handle.read(buffer, 0, requested, 0);
    const truncated = info.size > MAX_FILE_BYTES;
    const payload = buffer.subarray(0, Math.min(bytesRead, MAX_FILE_BYTES));
    const decoded = decodeText(payload);
    return WorkspaceFileReadResponseSchema.parse({
      path: relativePath,
      size: info.size,
      binary: decoded.binary,
      content: decoded.content,
      truncated
    });
  } finally {
    await handle.close();
  }
}

function wslPrefix(workspace: WorkspaceDefinition): string[] {
  if (workspace.runtime.kind !== "wsl") {
    throw new Error("Workspace is not a WSL runtime");
  }
  return workspace.runtime.distribution
    ? ["--distribution", workspace.runtime.distribution]
    : [];
}

async function runWslScript(
  workspace: WorkspaceDefinition,
  script: string,
  args: string[],
  maxStdoutBytes: number,
  excludedEnvironmentKeys: string[]
) {
  if (process.platform !== "win32") {
    throw new Error("WSL workspace browsing is available only on Windows");
  }
  const environment = withoutEnvironmentKeys(
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
      "--exec",
      "/bin/sh",
      "-c",
      script,
      "palmtty-workspace-files",
      ...args
    ],
    cwd: process.cwd(),
    env: environment,
    timeoutMs: PROCESS_TIMEOUT_MS,
    maxStdoutBytes
  });
}

const WSL_LIST_SCRIPT = [
  'root="$1"',
  'rel="$2"',
  'cd -- "$root" || exit 20',
  'root_physical="$(pwd -P)"',
  'target="$root_physical"',
  '[ -z "$rel" ] || target="$root_physical/$rel"',
  'cd -- "$target" || exit 21',
  'current="$(pwd -P)"',
  'case "$current" in "$root_physical"|"$root_physical"/*) ;; *) exit 22 ;; esac',
  'for entry in ./* ./.[!.]* ./..?*; do',
  '  [ -e "$entry" ] || [ -L "$entry" ] || continue',
  '  resolved="$(readlink -f -- "$entry" 2>/dev/null || true)"',
  '  [ -n "$resolved" ] || continue',
  '  case "$resolved" in "$root_physical"|"$root_physical"/*) ;; *) continue ;; esac',
  '  name="${entry#./}"',
  '  if [ -d "$entry" ]; then',
  '    printf "d\\0%s\\0\\0" "$name"',
  '  elif [ -f "$entry" ]; then',
  '    size="$(stat -c %s -- "$entry" 2>/dev/null || printf 0)"',
  '    printf "f\\0%s\\0%s\\0" "$name" "$size"',
  '  fi',
  'done'
].join("\n");

async function listWslFiles(
  workspace: WorkspaceDefinition,
  relativePath: string,
  excludedEnvironmentKeys: string[]
): Promise<WorkspaceFileListResponse> {
  const result = await runWslScript(
    workspace,
    WSL_LIST_SCRIPT,
    [workspace.cwd, relativePath],
    1024 * 1024,
    excludedEnvironmentKeys
  );
  if (result.code !== 0 && !result.stdoutTruncated) {
    throw new Error(result.stderr.trim() || "WSL directory listing failed");
  }

  const records = result.stdout.toString("utf8").split("\0");
  const entries: WorkspaceFileEntry[] = [];
  for (let index = 0; index + 2 < records.length; index += 3) {
    const type = records[index];
    const name = records[index + 1];
    const size = records[index + 2];
    if (!name || (type !== "d" && type !== "f")) continue;
    if (entries.length >= MAX_ENTRIES) break;
    entries.push({
      name,
      path: childRelativePath(relativePath, name),
      kind: type === "d" ? "directory" : "file",
      ...(type === "f" ? { size: Number.parseInt(size || "0", 10) || 0 } : {})
    });
  }

  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });

  return WorkspaceFileListResponseSchema.parse({
    path: relativePath,
    parentPath: relativeParent(relativePath),
    entries,
    truncated: result.stdoutTruncated || entries.length >= MAX_ENTRIES
  });
}

const WSL_READ_SCRIPT = [
  'root="$1"',
  'rel="$2"',
  'cd -- "$root" || exit 20',
  'root_physical="$(pwd -P)"',
  'target="$root_physical/$rel"',
  'resolved="$(readlink -f -- "$target" 2>/dev/null || true)"',
  '[ -n "$resolved" ] || exit 21',
  'case "$resolved" in "$root_physical"|"$root_physical"/*) ;; *) exit 22 ;; esac',
  '[ -f "$resolved" ] || exit 23',
  'size="$(stat -c %s -- "$resolved" 2>/dev/null)" || exit 24',
  'printf "%s\\0" "$size"',
  `head -c ${MAX_FILE_BYTES + 1} -- "$resolved"`
].join("\n");

async function readWslFile(
  workspace: WorkspaceDefinition,
  relativePath: string,
  excludedEnvironmentKeys: string[]
): Promise<WorkspaceFileReadResponse> {
  const result = await runWslScript(
    workspace,
    WSL_READ_SCRIPT,
    [workspace.cwd, relativePath],
    MAX_FILE_BYTES + 64 * 1024,
    excludedEnvironmentKeys
  );
  if (result.code !== 0 && !result.stdoutTruncated) {
    throw new Error(result.stderr.trim() || "WSL file read failed");
  }

  const separator = result.stdout.indexOf(0);
  if (separator < 0) throw new Error("WSL file read returned an invalid response");
  const size = Number.parseInt(result.stdout.subarray(0, separator).toString("utf8"), 10);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("WSL file size was invalid");
  }
  const body = result.stdout.subarray(
    separator + 1,
    Math.min(result.stdout.length, separator + 1 + MAX_FILE_BYTES)
  );
  const decoded = decodeText(body);
  return WorkspaceFileReadResponseSchema.parse({
    path: relativePath,
    size,
    binary: decoded.binary,
    content: decoded.content,
    truncated: size > MAX_FILE_BYTES || result.stdoutTruncated
  });
}

export async function listWorkspaceFiles(
  workspace: WorkspaceDefinition,
  requestedPath: string,
  excludedEnvironmentKeys: string[] = []
): Promise<WorkspaceFileListResponse> {
  const relativePath = normalizeWorkspaceRelativePath(requestedPath);
  return workspace.runtime.kind === "wsl"
    ? listWslFiles(workspace, relativePath, excludedEnvironmentKeys)
    : listHostFiles(workspace, relativePath);
}

export async function readWorkspaceFile(
  workspace: WorkspaceDefinition,
  requestedPath: string,
  excludedEnvironmentKeys: string[] = []
): Promise<WorkspaceFileReadResponse> {
  const relativePath = normalizeWorkspaceRelativePath(requestedPath);
  if (!relativePath) throw new Error("File path is required");
  return workspace.runtime.kind === "wsl"
    ? readWslFile(workspace, relativePath, excludedEnvironmentKeys)
    : readHostFile(workspace, relativePath);
}
