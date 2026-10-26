import { spawn } from "node:child_process";
import { spawnOwnedProcess, stopOwnedProcess } from "./owned-process.js";

export type BoundedProcessOptions = {
  executable: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv | Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  owned?: boolean;
  truncateStdout?: boolean;
};

export type BoundedProcessResult = {
  code: number | null;
  stdout: Buffer;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};

export async function runBoundedProcess(
  options: BoundedProcessOptions
): Promise<BoundedProcessResult> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const maxStdoutBytes = options.maxStdoutBytes ?? 1024 * 1024;
  const maxStderrBytes = options.maxStderrBytes ?? 32 * 1024;

  return new Promise<BoundedProcessResult>((resolve, reject) => {
    const child = options.owned ? spawnOwnedProcess({
      executable: options.executable, args: options.args,
      cwd: options.cwd ?? process.cwd(), env: options.env ?? process.env
    }) : spawn(options.executable, options.args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: options.env } : {})
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let failure: Error | undefined;
    const abort = () => { failure = new Error("Process aborted"); void stopOwnedProcess(child); };
    if (options.owned && options.signal) {
      options.signal.addEventListener("abort", abort, { once: true });
      if (options.signal.aborted) abort();
    }

    const finish = (error?: Error, code: number | null = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) {
        reject(error);
        return;
      }
      resolve({
        code,
        stdout: Buffer.concat(stdout),
        stderr,
        stdoutTruncated,
        stderrTruncated
      });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled || stdoutTruncated) return;
      const remaining = maxStdoutBytes - stdoutBytes;
      if (remaining <= 0) {
        stdoutTruncated = true;
        if (!options.truncateStdout) child.kill();
        return;
      }
      if (chunk.length > remaining) {
        stdout.push(chunk.subarray(0, remaining));
        stdoutBytes += remaining;
        stdoutTruncated = true;
        if (!options.truncateStdout) child.kill();
        return;
      }
      stdout.push(chunk);
      stdoutBytes += chunk.length;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (settled || stderrTruncated) return;
      const remaining = maxStderrBytes - Buffer.byteLength(stderr, "utf8");
      if (remaining <= 0) {
        stderrTruncated = true;
        return;
      }
      const bytes = Buffer.from(chunk, "utf8");
      if (bytes.length > remaining) {
        stderr += bytes.subarray(0, remaining).toString("utf8");
        stderrTruncated = true;
        return;
      }
      stderr += chunk;
    });

    child.once("error", (error) => finish(error));
    child.once("close", (code) => finish(failure, code));

    timer = setTimeout(() => {
      failure = new Error(`Process timed out after ${timeoutMs} ms`);
      if (options.owned) void stopOwnedProcess(child).then(() => finish(failure));
      else { child.kill(); finish(failure); }
    }, timeoutMs);
    timer.unref();
  });
}
