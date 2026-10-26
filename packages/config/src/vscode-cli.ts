import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Discover the user's official VS Code CLI. This is not a process-health check
 * or permission to host Microsoft's server as an unattended service.
 * Shared by catalogue discovery and explicit host-configured managed launch.
 */
export function officialVSCodeCliCandidates(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir()
): string[] {
  if (platform === "win32") {
    return [
      ...(env.LOCALAPPDATA
        ? [path.win32.join(env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "bin", "code.cmd")]
        : []),
      path.win32.join(env.ProgramFiles ?? "C:\\Program Files",
        "Microsoft VS Code", "bin", "code.cmd"),
      path.win32.join(env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
        "Microsoft VS Code", "bin", "code.cmd"),
      ...(env.PATH ?? "").split(";").filter(Boolean).flatMap((dir) => [
        path.win32.join(dir, "code.cmd"), path.win32.join(dir, "code.exe")
      ])
    ];
  }
  return [
    "/usr/local/bin/code",
    "/usr/bin/code",
    path.posix.join(home, ".local", "bin", "code"),
    ...(env.PATH ?? "").split(":").filter(Boolean).map((dir) =>
      path.posix.join(dir, "code"))
  ];
}

export async function findOfficialVSCodeCli(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir()
): Promise<string | undefined> {
  const permissions = platform === "win32" ? constants.F_OK : constants.X_OK;
  for (const candidate of new Set(officialVSCodeCliCandidates(platform, env, home))) {
    try {
      await access(candidate, permissions);
      return candidate;
    } catch {
      // Keep scanning; users may install VS Code without restarting PalmTTY.
    }
  }
  return undefined;
}
