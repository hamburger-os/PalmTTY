import { spawn, type ChildProcess } from "node:child_process";

// POSIX-only lease runner. The workload has its own process group, so cleanup
// can outlive its leader while this supervisor preserves the workload exit code.
let frame = "";
let launched = false;
let child: ChildProcess | undefined;
let stopping = false;
const stop = (code = 1) => {
  if (stopping) return;
  stopping = true;
  const group = child?.pid;
  if (group) try { process.kill(-group, "SIGTERM"); } catch { /* already gone */ }
  setTimeout(() => {
    if (group) try { process.kill(-group, "SIGKILL"); } catch { /* already gone */ }
    process.exit(code);
  }, 350);
};
process.stdin.setEncoding("utf8");
process.stdin.on("end", () => stop());
process.stdin.on("error", () => stop());
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
process.stdin.on("data", (chunk: string) => {
  if (launched) return;
  frame += chunk;
  if (Buffer.byteLength(frame) > 65536) return stop();
  const end = frame.indexOf("\n");
  if (end < 0) return;
  launched = true;
  try {
    const launch = JSON.parse(frame.slice(0, end)) as { executable: string; args: string[]; cwd: string };
    frame = "";
    child = spawn(launch.executable, launch.args, { cwd: launch.cwd, detached: true, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", () => stop());
    child.once("exit", (code) => stop(code ?? 1));
  } catch { stop(); }
});
