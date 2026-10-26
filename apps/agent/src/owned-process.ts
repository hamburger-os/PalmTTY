import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { installedRoot } from "./runtime-layout.js";

export type OwnedLaunch = { executable: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv };

/** Private pipe lease + native Job / POSIX group. The wrapper is never detached from ownership. */
export function spawnOwnedProcess(launch: OwnedLaunch): ChildProcessWithoutNullStreams {
  const root = installedRoot();
  const sourceDist = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../dist/" : "./", import.meta.url));
  const hash = !root && process.platform === "win32" ? readFileSync(path.join(sourceDist, "process-host.sha256"), "utf8") : "";
  if (hash && !/^[a-f0-9]{64}$/u.test(hash)) throw new Error("Invalid process host build stamp");
  const nativeHost = root ? path.join(root, "bin", "palmtty-autostart-host.exe")
    : path.join(sourceDist, `palmtty-process-host-${hash}.exe`);
  const executable = process.platform === "win32" ? nativeHost : process.execPath;
  const args = process.platform === "win32" ? ["--owned-child"]
    : [fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "./owned-process-runner.ts" : "./owned-process-runner.js", import.meta.url))];
  const child = spawn(executable, args, {
    cwd: launch.cwd, env: launch.env, windowsHide: true,
    detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"]
  });
  // Never put credentials or environment values in argv or persistent manifests.
  child.stdin.on("error", () => undefined);
  child.stdin.write(JSON.stringify({ executable: launch.executable, args: launch.args, cwd: launch.cwd }) + "\n");
  return child;
}

export async function stopOwnedProcess(child?: ChildProcess): Promise<void> {
  if (!child) return;
  child.stdin?.destroy();
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); child.off("close", done); resolve(); };
    const timer = setTimeout(() => {
      if (process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* group gone */ }
      } else { child.kill(); }
      done();
    }, 2500);
    child.once("close", done);
  });
}
