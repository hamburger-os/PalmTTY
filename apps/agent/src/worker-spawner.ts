import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { WorkerBootstrap } from "./worker-protocol.js";

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

export class ProcessWorkerSpawner implements WorkerSpawner {
  async spawn(bootstrap: WorkerBootstrap): Promise<void> {
    const environment = { ...process.env };
    for (const key of bootstrap.excludedEnvKeys) delete environment[key];

    const child = spawn(process.execPath, workerInvocation(), {
      detached: true,
      windowsHide: true,
      stdio: ["pipe", "ignore", "ignore"],
      env: environment
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      child.once("error", onError);
      child.once("spawn", () => {
        child.off("error", onError);
        resolve();
      });
    });

    if (!child.stdin) {
      child.kill();
      throw new Error("Session worker bootstrap channel is unavailable");
    }

    await new Promise<void>((resolve, reject) => {
      child.stdin!.once("error", reject);
      child.stdin!.end(JSON.stringify(bootstrap), "utf8", () => resolve());
    });

    child.unref();
  }
}
