import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
  RuntimeCapabilities,
  WorkspaceDefinition
} from "@palmtty/protocol";
import { z } from "zod";
import {
  addWslEnvironmentForwarding,
  applyEnvironmentOverrides,
  readHostEnvironment
} from "./host-environment.js";

export const RuntimeWorkspaceSchema = z.object({
  id: z.string().min(1).max(64),
  cwd: z.string().min(1).refine(path.isAbsolute, "runtime cwd must be absolute"),
  executable: z.string().min(1).refine(path.isAbsolute, "runtime executable must be absolute"),
  args: z.array(z.string()).max(64),
  command: z.string().max(8192).optional(),
  env: z.record(z.string(), z.string())
});
export type RuntimeWorkspace = z.infer<typeof RuntimeWorkspaceSchema>;

export const SessionLaunchRuntimeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("host") }).strict(),
  z.object({
    kind: z.literal("wsl"),
    distribution: z.string().min(1).max(128).optional()
  }).strict()
]);
export type SessionLaunchRuntime = z.infer<typeof SessionLaunchRuntimeSchema>;

export function sessionLaunchRuntime(
  workspace: WorkspaceDefinition
): SessionLaunchRuntime {
  if (workspace.runtime.kind === "host") return { kind: "host" };
  return SessionLaunchRuntimeSchema.parse({
    kind: "wsl",
    ...(workspace.runtime.distribution
      ? { distribution: workspace.runtime.distribution }
      : {})
  });
}

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

function isProtectedWindowsAppsEntry(
  candidate: string,
  env: NodeJS.ProcessEnv | Record<string, string>
): boolean {
  if (process.platform !== "win32") return false;
  const programFiles = environmentValue(env, "ProgramFiles");
  if (!programFiles) return false;
  const root = normalizedWindowsPath(path.join(programFiles, "WindowsApps"));
  const value = normalizedWindowsPath(candidate);
  return value === root || value.startsWith(`${root}${path.sep}`);
}

function searchPathEntries(
  env: NodeJS.ProcessEnv | Record<string, string>
): string[] {
  const searchPath = environmentValue(env, "PATH") ?? "";
  return searchPath
    .split(path.delimiter)
    .map((rawEntry) => rawEntry.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
}

async function usableFile(
  candidate: string,
  env: NodeJS.ProcessEnv | Record<string, string>
): Promise<string | undefined> {
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
        const candidate = path.join(entry, `${program}${extension}`);
        if (isProtectedWindowsAppsEntry(candidate, env)) continue;
        const resolved = await usableFile(candidate, env);
        if (resolved) return resolved;
      }
    }
  }

  throw new Error(
    `Shell executable "${program}" was not found. ` +
    "Install it, add it to PATH, or configure an explicit shell."
  );
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

function defaultHostShell(
  env: NodeJS.ProcessEnv | Record<string, string>
): string {
  if (process.platform === "win32") return "pwsh.exe";
  return env.SHELL?.trim() || "/bin/sh";
}

function wslPrefix(workspace: WorkspaceDefinition): string[] {
  if (workspace.runtime.kind !== "wsl") {
    throw new Error("Workspace is not a WSL runtime");
  }
  return workspace.runtime.distribution
    ? ["--distribution", workspace.runtime.distribution]
    : [];
}

export function buildWslLaunchArgs(workspace: WorkspaceDefinition): string[] {
  if (workspace.runtime.kind !== "wsl") {
    throw new Error("Workspace is not a WSL runtime");
  }
  const args = [...wslPrefix(workspace), "--cd", workspace.cwd];
  if (workspace.runtime.shell) {
    args.push("--exec", workspace.runtime.shell, ...workspace.runtime.args);
  }
  return args;
}

async function runProcessProbe(
  executable: string,
  args: string[],
  timeoutMs = 8_000,
  env?: Record<string, string>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      ...(env ? { env } : {})
    });
    let stderr = "";
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 8192) stderr += chunk.slice(0, 8192 - stderr.length);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code === 0) {
        finish();
        return;
      }
      const detail = stderr.trim();
      finish(new Error(
        detail
          ? `WSL validation failed: ${detail}`
          : `WSL validation failed with exit code ${code ?? "unknown"}`
      ));
    });

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("WSL validation timed out"));
    }, timeoutMs);
    timer.unref();
  });
}

async function resolveHostWorkspace(
  workspace: WorkspaceDefinition
): Promise<RuntimeWorkspace> {
  if (workspace.runtime.kind !== "host") throw new Error("Expected host runtime");

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

  const cwd = await realpath(workspace.cwd);
  const hostEnvironment = await readHostEnvironment();
  const environment = applyEnvironmentOverrides(
    hostEnvironment,
    workspace.environment ?? {}
  );
  const requestedExecutable = workspace.runtime.shell ?? defaultHostShell(environment);
  let executable: string;
  try {
    executable = await resolveExecutable(requestedExecutable, {
      cwd,
      env: environment
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Workspace "${workspace.id}" is not launchable: ${detail}`);
  }

  return RuntimeWorkspaceSchema.parse({
    id: workspace.id,
    cwd,
    executable,
    args: workspace.runtime.args,
    ...(workspace.startupCommand ? { command: workspace.startupCommand } : {}),
    env: environment
  });
}

async function resolveWslWorkspace(
  workspace: WorkspaceDefinition
): Promise<RuntimeWorkspace> {
  if (workspace.runtime.kind !== "wsl") throw new Error("Expected WSL runtime");
  if (process.platform !== "win32") {
    throw new Error("WSL workspaces are supported only by a Windows PalmTTY Agent");
  }

  const hostEnvironment = await readHostEnvironment();
  let executable: string;
  try {
    executable = await resolveExecutable("wsl.exe", {
      cwd: process.cwd(),
      env: hostEnvironment
    });
  } catch {
    throw new Error(
      `Workspace "${workspace.id}" requires WSL, but wsl.exe is unavailable`
    );
  }

  const probe = [
    ...wslPrefix(workspace),
    "--cd",
    workspace.cwd,
    "--exec",
    "/bin/sh",
    "-lc",
    workspace.runtime.shell
      ? 'command -v "$1" >/dev/null 2>&1'
      : "exit 0",
    "palmtty-probe",
    ...(workspace.runtime.shell ? [workspace.runtime.shell] : [])
  ];

  try {
    await runProcessProbe(executable, probe, 8_000, hostEnvironment);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Workspace "${workspace.id}" is not launchable: ${detail}`);
  }

  const overriddenEnvironment = applyEnvironmentOverrides(
    hostEnvironment,
    workspace.environment ?? {}
  );
  const environment = addWslEnvironmentForwarding(
    overriddenEnvironment,
    Object.keys(workspace.environment ?? {})
  );

  return RuntimeWorkspaceSchema.parse({
    id: workspace.id,
    cwd: process.cwd(),
    executable,
    args: buildWslLaunchArgs(workspace),
    ...(workspace.startupCommand ? { command: workspace.startupCommand } : {}),
    env: environment
  });
}

export async function resolveRuntimeWorkspace(
  workspace: WorkspaceDefinition
): Promise<RuntimeWorkspace> {
  return workspace.runtime.kind === "wsl"
    ? resolveWslWorkspace(workspace)
    : resolveHostWorkspace(workspace);
}

export async function detectRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  const platform: RuntimeCapabilities["platform"] =
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin"
      ? process.platform
      : "other";

  let wsl = false;
  if (process.platform === "win32") {
    try {
      const environment = await readHostEnvironment();
      const executable = await resolveExecutable("wsl.exe", {
        cwd: process.cwd(),
        env: environment
      });
      await runProcessProbe(executable, ["--status"], 5_000, environment);
      wsl = true;
    } catch {
      wsl = false;
    }
  }

  return {
    platform,
    runtimes: {
      host: true,
      wsl
    }
  };
}

export function buildPtyEnvironment(
  workspace: RuntimeWorkspace,
  excludedEnvKeys: string[] = []
): Record<string, string | undefined> {
  const environment: Record<string, string | undefined> = { ...workspace.env };

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
