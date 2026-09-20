import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { WorkerBootstrap } from "./worker-protocol.js";

const WORKER_READY_LINE = "PALMTTY_WORKER_READY";
const WORKER_START_TIMEOUT_MS = 8_000;
const MAX_STARTUP_STDERR_BYTES = 8 * 1024;

export interface WorkerSpawner {
  spawn(bootstrap: WorkerBootstrap): Promise<void>;
}

function workerInvocation(): string[] {
  const currentFile = fileURLToPath(import.meta.url);
  const sourceMode = currentFile.endsWith(".ts");
  const entry = path.join(path.dirname(currentFile), sourceMode ? "index.ts" : "index.js");
  return sourceMode
    ? ["--import", "tsx", entry, "--session-worker"]
    : [entry, "--session-worker"];
}

function removeEnvironmentKey(
  environment: Record<string, string | undefined>,
  key: string
): void {
  if (process.platform !== "win32") {
    delete environment[key];
    return;
  }
  const lower = key.toLowerCase();
  for (const existing of Object.keys(environment)) {
    if (existing.toLowerCase() === lower) delete environment[existing];
  }
}

export class ProcessWorkerSpawner implements WorkerSpawner {
  async spawn(bootstrap: WorkerBootstrap): Promise<void> {
    const environment = { ...process.env };
    for (const key of bootstrap.excludedEnvKeys) {
      removeEnvironmentKey(environment, key);
    }

    const child = spawn(process.execPath, workerInvocation(), {
      detached: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: environment
    });

    if (!child.stdin || !child.stdout || !child.stderr) {
      child.kill();
      throw new Error("Session worker bootstrap channels are unavailable");
    }

    let startupStderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (Buffer.byteLength(startupStderr, "utf8") >= MAX_STARTUP_STDERR_BYTES) return;
      startupStderr += chunk;
      if (Buffer.byteLength(startupStderr, "utf8") > MAX_STARTUP_STDERR_BYTES) {
        startupStderr = Buffer.from(startupStderr, "utf8")
          .subarray(0, MAX_STARTUP_STDERR_BYTES)
          .toString("utf8");
      }
    });

    const ready = new Promise<void>((resolve, reject) => {
      let stdout = "";
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off("error", onError);
        child.off("close", onClose);
        child.stdout!.off("data", onData);
        if (error) reject(error);
        else resolve();
      };

      const onError = (error: Error) => finish(error);
      const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
        const detail = startupStderr.trim();
        finish(new Error(
          `Session worker exited before ready (code=${code ?? "null"}, signal=${signal ?? "null"})` +
          (detail ? `: ${detail}` : "")
        ));
      };
      const onData = (chunk: Buffer | string) => {
        stdout += chunk.toString();
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() ?? "";
        if (lines.some((line) => line.trim() === WORKER_READY_LINE)) finish();
      };

      const timer = setTimeout(() => {
        finish(new Error(
          "Session worker startup timed out" +
          (startupStderr.trim() ? `: ${startupStderr.trim()}` : "")
        ));
      }, WORKER_START_TIMEOUT_MS);
      timer.unref();

      child.once("error", onError);
      child.once("close", onClose);
      child.stdout!.on("data", onData);
    });

    const bootstrapWritten = new Promise<void>((resolve, reject) => {
      child.stdin!.once("error", reject);
      child.stdin!.end(JSON.stringify(bootstrap), "utf8", () => resolve());
    });

    try {
      await Promise.all([bootstrapWritten, ready]);
      child.unref();
    } catch (error) {
      try { child.kill(); } catch { /* best effort for a pre-ready child */ }
      throw error;
    } finally {
      child.stdout.destroy();
      child.stderr.destroy();
    }
  }
}
