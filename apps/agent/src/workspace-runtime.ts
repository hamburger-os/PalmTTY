import { constants } from "node:fs";
import { access, lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceConfig } from "@palmtty/config";
import { z } from "zod";

export const RuntimeWorkspaceSchema = z.object({
  id: z.string().min(1).max(64),
  cwd: z.string().min(1).refine(path.isAbsolute, "runtime cwd must be absolute"),
  executable: z.string().min(1).refine(path.isAbsolute, "runtime executable must be absolute"),
  args: z.array(z.string()).max(32),
  command: z.string().max(8192).optional(),
  env: z.record(z.string(), z.string())
});

export type RuntimeWorkspace = z.infer<typeof RuntimeWorkspaceSchema>;

function environmentValue(
  env: NodeJS.ProcessEnv | Record<string, string>,
  key: string
): string | undefined {
  if (process.platform !== "win32") return env[key];
  const target = key.toLowerCase();
  for (const [candidate, value] of Object.entries(env)) {
    if (candidate.toLowerCase() === target) return value;
  }
  return undefined;
}

function executableExtensions(
  program: string,
  env: NodeJS.ProcessEnv | Record<string, string>
): string[] {
  if (process.platform !== "win32" || path.extname(program)) return [""];
  const configured = environmentValue(env, "PATHEXT");
  const values = (configured ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  return ["", ...values];
}

function normalizedWindowsPath(value: string): string {
  return path.resolve(value).toLowerCase();
}

function userWindowsAppsDirectory(
  env: NodeJS.ProcessEnv | Record<string, string>
): string | undefined {
  if (process.platform !== "win32") return undefined;
  const localAppData = environmentValue(env, "LOCALAPPDATA");
  if (!localAppData) return undefined;
  return path.join(localAppData, "Microsoft", "WindowsApps");
}

function isUserWindowsAppsEntry(
  candidate: string,
  env: NodeJS.ProcessEnv | Record<string, string>
): boolean {
  const windowsApps = userWindowsAppsDirectory(env);
  if (!windowsApps) return false;
  const root = normalizedWindowsPath(windowsApps);
  const value = normalizedWindowsPath(candidate);
  return value === root || value.startsWith(`${root}${path.sep}`);
}

function searchPathEntries(
  env: NodeJS.ProcessEnv | Record<string, string>
): string[] {
  const searchPath = environmentValue(env, "PATH") ?? "";
  const entries = searchPath
    .split(path.delimiter)
    .map((rawEntry) => rawEntry.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);

  if (process.platform !== "win32") return entries;

  const windowsApps = userWindowsAppsDirectory(env);
  if (!windowsApps) return entries;
  const preferred = normalizedWindowsPath(windowsApps);

  return [
    ...entries.filter((entry) => normalizedWindowsPath(entry) === preferred),
    ...entries.filter((entry) => normalizedWindowsPath(entry) !== preferred)
  ];
}

async function usableFile(
  candidate: string,
  env: NodeJS.ProcessEnv | Record<string, string>
): Promise<string | undefined> {
  // MSIX App Execution Aliases under the current user's WindowsApps directory
  // are special reparse points. Node's stat/access APIs can report EACCES for
  // them even though Windows can launch the alias. lstat can inspect the alias
  // itself, so preserve this absolute activation path instead of trying to
  // resolve through the protected package target.
  if (process.platform === "win32" && isUserWindowsAppsEntry(candidate, env)) {
    try {
      const info = await lstat(candidate);
      if (!info.isDirectory()) return path.resolve(candidate);
    } catch {
      return undefined;
    }
  }

  try {
    await access(
      candidate,
      process.platform === "win32" ? constants.F_OK : constants.X_OK
    );
    const info = await stat(candidate);
    if (!info.isFile()) return undefined;
    return await realpath(candidate);
  } catch {
    return undefined;
  }
}

function pathLike(program: string): boolean {
  return path.isAbsolute(program) || program.includes("/") || program.includes("\\");
}

export async function resolveExecutable(
  program: string,
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv | Record<string, string>;
  }
): Promise<string> {
  const env = options.env ?? process.env;
  const extensions = executableExtensions(program, env);

  if (pathLike(program)) {
    const base = path.isAbsolute(program)
      ? program
      : path.resolve(options.cwd, program);
    for (const extension of extensions) {
      const resolved = await usableFile(`${base}${extension}`, env);
      if (resolved) return resolved;
    }
  } else {
    for (const entry of searchPathEntries(env)) {
      for (const extension of extensions) {
        const resolved = await usableFile(
          path.join(entry, `${program}${extension}`),
          env
        );
        if (resolved) return resolved;
      }
    }
  }

  throw new Error(
    `Shell executable "${program}" was not found. ` +
    "Install it, add it to PATH, or configure an explicit shellPath."
  );
}

function mergedEnvironment(workspace: WorkspaceConfig): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...process.env };
  if (process.platform !== "win32") {
    Object.assign(merged, workspace.env);
    return merged;
  }

  for (const [key, value] of Object.entries(workspace.env)) {
    const lower = key.toLowerCase();
    for (const existing of Object.keys(merged)) {
      if (existing.toLowerCase() === lower && existing !== key) delete merged[existing];
    }
    merged[key] = value;
  }
  return merged;
}

async function workspaceDirectoryState(
  cwd: string
): Promise<"directory" | "not-directory" | "unavailable"> {
  try {
    return (await stat(cwd)).isDirectory() ? "directory" : "not-directory";
  } catch {
    try {
      return (await lstat(cwd)).isDirectory() ? "directory" : "not-directory";
    } catch {
      return "unavailable";
    }
  }
}

export async function resolveRuntimeWorkspace(
  workspace: WorkspaceConfig
): Promise<RuntimeWorkspace> {
  const cwdState = await workspaceDirectoryState(workspace.cwd);
  if (cwdState === "unavailable") {
    throw new Error(
      `Workspace "${workspace.id}" directory is unavailable: ${workspace.cwd}`
    );
  }
  if (cwdState === "not-directory") {
    throw new Error(
      `Workspace "${workspace.id}" is not a directory: ${workspace.cwd}`
    );
  }

  const requestedExecutable =
    workspace.shellPath ?? (process.platform === "win32" ? "pwsh.exe" : "pwsh");
  let executable: string;
  try {
    executable = await resolveExecutable(requestedExecutable, {
      cwd: workspace.cwd,
      env: mergedEnvironment(workspace)
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Workspace "${workspace.id}" is not launchable: ${detail}`);
  }

  return RuntimeWorkspaceSchema.parse({
    id: workspace.id,
    cwd: await realpath(workspace.cwd),
    executable,
    args: workspace.args,
    ...(workspace.command ? { command: workspace.command } : {}),
    env: workspace.env
  });
}

export async function resolveRuntimeWorkspaces(
  workspaces: WorkspaceConfig[]
): Promise<Map<string, RuntimeWorkspace>> {
  const resolved = await Promise.all(workspaces.map(resolveRuntimeWorkspace));
  return new Map(resolved.map((workspace) => [workspace.id, workspace]));
}

export function buildPtyEnvironment(
  workspace: RuntimeWorkspace,
  excludedEnvKeys: string[] = []
): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = { ...process.env };

  const deleteKey = (key: string) => {
    if (process.platform !== "win32") {
      delete environment[key];
      return;
    }
    const lower = key.toLowerCase();
    for (const existing of Object.keys(environment)) {
      if (existing.toLowerCase() === lower) delete environment[existing];
    }
  };

  for (const [key, value] of Object.entries(workspace.env)) {
    deleteKey(key);
    environment[key] = value;
  }
  for (const key of excludedEnvKeys) deleteKey(key);
  environment.TERM = "xterm-256color";
  return environment;
}
