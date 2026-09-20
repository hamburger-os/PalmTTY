import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
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

async function usableFile(candidate: string): Promise<string | undefined> {
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
      const resolved = await usableFile(`${base}${extension}`);
      if (resolved) return resolved;
    }
  } else {
    const searchPath = environmentValue(env, "PATH") ?? "";
    for (const rawEntry of searchPath.split(path.delimiter)) {
      const entry = rawEntry.trim().replace(/^"(.*)"$/, "$1");
      if (!entry) continue;
      for (const extension of extensions) {
        const resolved = await usableFile(path.join(entry, `${program}${extension}`));
        if (resolved) return resolved;
      }
    }
  }

  throw new Error(
    `Shell executable "${program}" was not found. ` +
    `Install it, add it to PATH, or configure an explicit shellPath.`
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

export async function resolveRuntimeWorkspace(
  workspace: WorkspaceConfig
): Promise<RuntimeWorkspace> {
  let info;
  try {
    info = await stat(workspace.cwd);
  } catch {
    throw new Error(
      `Workspace "${workspace.id}" directory is unavailable: ${workspace.cwd}`
    );
  }
  if (!info.isDirectory()) {
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
