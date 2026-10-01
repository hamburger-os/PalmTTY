import { opendir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  RemoteAppCatalogResponseSchema,
  RemoteAppExecutableListingSchema,
  type RemoteAppCatalogEntry,
  type RemoteAppExecutableListing,
  type RemoteAppExecutableLocation
} from "@palmtty/protocol";
import { readHostEnvironment } from "./host-environment.js";
import { resolveExecutable } from "./workspace-runtime.js";

const MAX_ENTRIES = 256;

const KNOWN_APPS = [
  { name: "Codex Desktop", programs: ["codex.exe", "Codex.exe"] },
  { name: "Visual Studio Code", programs: ["Code.exe"] },
  { name: "ChatGPT", programs: ["ChatGPT.exe"] },
  { name: "Antigravity", programs: ["Antigravity IDE.exe", "antigravity.exe"] }
] as const;

function requireWindows(): void {
  if (process.platform !== "win32") {
    throw new Error("Remote App application browsing is available only on Windows");
  }
}

function environmentValue(
  environment: Record<string, string>,
  key: string
): string | undefined {
  const target = key.toLowerCase();
  const found = Object.entries(environment).find(
    ([candidate]) => candidate.toLowerCase() === target
  );
  return found?.[1];
}

function uniqueLocations(
  entries: Array<RemoteAppExecutableLocation | undefined>
): RemoteAppExecutableLocation[] {
  const seen = new Set<string>();
  return entries.filter((entry): entry is RemoteAppExecutableLocation => {
    if (!entry) return false;
    const key = entry.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function existingDirectoryLocation(
  label: string,
  candidate: string | undefined
): Promise<RemoteAppExecutableLocation | undefined> {
  if (!candidate) return undefined;
  try {
    const resolved = await realpath(candidate);
    if (!(await stat(resolved)).isDirectory()) return undefined;
    return { label, path: resolved };
  } catch {
    return undefined;
  }
}

export async function detectRemoteAppCatalog(): Promise<{
  apps: RemoteAppCatalogEntry[];
}> {
  requireWindows();
  const environment = await readHostEnvironment();
  const apps: RemoteAppCatalogEntry[] = [];
  const seen = new Set<string>();

  for (const candidate of KNOWN_APPS) {
    for (const program of candidate.programs) {
      try {
        const executable = await resolveExecutable(program, {
          cwd: os.homedir(),
          env: environment
        });
        const key = executable.toLowerCase();
        if (seen.has(key)) break;
        seen.add(key);
        apps.push({
          name: candidate.name,
          executable,
          source: "detected"
        });
        break;
      } catch {
        // A missing known application is expected and omitted.
      }
    }
  }

  return RemoteAppCatalogResponseSchema.parse({ apps });
}

function displayName(executable: string): string {
  const base = path.basename(executable, path.extname(executable))
    .replace(/[-_]+/g, " ")
    .trim();
  return base || "Application";
}

export async function browseRemoteAppExecutables(
  requestedPath?: string
): Promise<RemoteAppExecutableListing> {
  requireWindows();
  const environment = await readHostEnvironment();

  const localAppData = environmentValue(environment, "LOCALAPPDATA");
  const programFiles = environmentValue(environment, "ProgramFiles");
  const programFilesX86 = environmentValue(environment, "ProgramFiles(x86)");
  const defaultPath = localAppData
    ? path.join(localAppData, "Programs")
    : os.homedir();

  const target = requestedPath ?? defaultPath;
  if (!path.isAbsolute(target)) {
    throw new Error("Remote App browser path must be absolute");
  }

  const currentPath = await realpath(target);
  if (!(await stat(currentPath)).isDirectory()) {
    throw new Error("Selected Remote App path is not a directory");
  }

  const locations = uniqueLocations(await Promise.all([
    existingDirectoryLocation("Programs", defaultPath),
    existingDirectoryLocation("Local AppData", localAppData),
    existingDirectoryLocation("Program Files", programFiles),
    existingDirectoryLocation("Program Files (x86)", programFilesX86),
    existingDirectoryLocation("~", os.homedir())
  ]));

  const directories: RemoteAppExecutableLocation[] = [];
  const executables: RemoteAppCatalogEntry[] = [];
  let count = 0;
  let truncated = false;
  const directory = await opendir(currentPath);

  for await (const entry of directory) {
    if (count >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    const candidate = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      directories.push({ label: entry.name, path: candidate });
      count += 1;
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".exe") {
      continue;
    }
    executables.push({
      name: displayName(candidate),
      executable: candidate,
      source: "path"
    });
    count += 1;
  }

  directories.sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
  );
  executables.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );

  const parent = path.dirname(currentPath);
  return RemoteAppExecutableListingSchema.parse({
    currentPath,
    parentPath: parent === currentPath ? null : parent,
    locations,
    directories,
    executables,
    truncated
  });
}
