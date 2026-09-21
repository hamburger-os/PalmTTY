import { spawn } from "node:child_process";
import { readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DirectoryListingSchema,
  type BrowseDirectoryRequest,
  type DirectoryListing,
  type DirectoryLocation
} from "@palmtty/protocol";
import { resolveExecutable } from "./workspace-runtime.js";

const MAX_DIRECTORIES = 512;
const MAX_PROCESS_OUTPUT_BYTES = 256 * 1024;
const PROCESS_TIMEOUT_MS = 8_000;

function sortLocations(entries: DirectoryLocation[]): DirectoryLocation[] {
  return entries.sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
  );
}

function uniqueLocations(entries: DirectoryLocation[]): DirectoryLocation[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = process.platform === "win32"
      ? entry.path.toLowerCase()
      : entry.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function hostLocations(home: string): Promise<DirectoryLocation[]> {
  if (process.platform !== "win32") {
    return uniqueLocations([
      { label: "~", path: home },
      { label: "/", path: "/" }
    ]);
  }

  const roots = await Promise.all(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(async (letter) => {
      const root = `${letter}:\\`;
      try {
        return (await stat(root)).isDirectory()
          ? { label: root, path: root }
          : undefined;
      } catch {
        return undefined;
      }
    })
  );

  return uniqueLocations([
    { label: "~", path: home },
    ...roots.filter((entry): entry is DirectoryLocation => Boolean(entry))
  ]);
}

async function browseHostDirectory(
  requestedPath?: string
): Promise<DirectoryListing> {
  const target = requestedPath ?? os.homedir();
  if (!path.isAbsolute(target)) {
    throw new Error("Host directory path must be absolute");
  }

  const currentPath = await realpath(target);
  if (!(await stat(currentPath)).isDirectory()) {
    throw new Error("Selected host path is not a directory");
  }

  const entries = await readdir(currentPath, { withFileTypes: true });
  const directories: DirectoryLocation[] = [];

  for (const entry of entries) {
    if (directories.length > MAX_DIRECTORIES) break;
    const candidate = path.join(currentPath, entry.name);
    let isDirectory = entry.isDirectory();
    if (!isDirectory && entry.isSymbolicLink()) {
      try {
        isDirectory = (await stat(candidate)).isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    if (isDirectory) {
      directories.push({ label: entry.name, path: candidate });
    }
  }

  const parent = path.dirname(currentPath);
  return DirectoryListingSchema.parse({
    currentPath,
    parentPath: parent === currentPath ? null : parent,
    locations: await hostLocations(os.homedir()),
    directories: sortLocations(directories.slice(0, MAX_DIRECTORIES)),
    truncated: directories.length > MAX_DIRECTORIES || entries.length > MAX_DIRECTORIES * 8
  });
}

async function runCapturedProcess(
  executable: string,
  args: string[]
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(stdout).toString("utf8"));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        finish(new Error("Directory listing exceeded the response limit"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 8192) {
        stderr += chunk.slice(0, 8192 - stderr.length);
      }
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (settled) return;
      if (code === 0) {
        finish();
        return;
      }
      const detail = stderr.trim();
      finish(new Error(
        detail
          ? `Directory browse failed: ${detail}`
          : `Directory browse failed with exit code ${code ?? "unknown"}`
      ));
    });

    timer = setTimeout(() => {
      child.kill();
      finish(new Error("Directory browse timed out"));
    }, PROCESS_TIMEOUT_MS);
    timer.unref();
  });
}

const WSL_DIRECTORY_SCRIPT = [
  'target="$1"',
  'if [ -z "$target" ]; then target="$HOME"; fi',
  'cd -- "$target" || exit 2',
  'printf "%s\\0%s\\0" "$(pwd -P)" "$HOME"',
  'for entry in ./* ./.[!.]* ./..?*; do',
  '  [ -d "$entry" ] || continue',
  '  printf "%s\\0" "$entry"',
  "done"
].join("\n");

async function browseWslDirectory(
  distribution: string | undefined,
  requestedPath?: string
): Promise<DirectoryListing> {
  if (process.platform !== "win32") {
    throw new Error("WSL directory browsing is available only on Windows");
  }

  const executable = await resolveExecutable("wsl.exe", {
    cwd: process.cwd(),
    env: process.env
  });
  const prefix = distribution
    ? ["--distribution", distribution]
    : [];
  const output = await runCapturedProcess(executable, [
    ...prefix,
    "--exec",
    "/bin/sh",
    "-c",
    WSL_DIRECTORY_SCRIPT,
    "palmtty-directory-browser",
    requestedPath ?? ""
  ]);
  const records = output.split("\0").filter((value) => value.length > 0);
  const currentPath = records[0];
  const home = records[1];
  if (!currentPath || !home || !path.posix.isAbsolute(currentPath)) {
    throw new Error("WSL directory browser returned an invalid path");
  }

  const rawDirectories = records.slice(2);
  const directories = rawDirectories
    .slice(0, MAX_DIRECTORIES)
    .map((entry) => {
      const relative = entry.startsWith("./") ? entry.slice(2) : entry;
      return {
        label: relative,
        path: path.posix.join(currentPath, relative)
      };
    });

  const parent = path.posix.dirname(currentPath);
  return DirectoryListingSchema.parse({
    currentPath,
    parentPath: parent === currentPath ? null : parent,
    locations: uniqueLocations([
      { label: "~", path: home },
      { label: "/", path: "/" }
    ]),
    directories: sortLocations(directories),
    truncated: rawDirectories.length > MAX_DIRECTORIES
  });
}

export async function browseWorkspaceDirectory(
  request: BrowseDirectoryRequest
): Promise<DirectoryListing> {
  return request.kind === "wsl"
    ? browseWslDirectory(request.distribution, request.path)
    : browseHostDirectory(request.path);
}
