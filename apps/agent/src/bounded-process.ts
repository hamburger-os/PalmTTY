import { spawn } from "node:child_process";

export type BoundedProcessOptions = {
  executable: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv | Record<string, string>;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
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
    const child = spawn(options.executable, options.args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
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

    const finish = (error?: Error, code: number | null = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
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
        child.kill();
        return;
      }
      if (chunk.length > remaining) {
        stdout.push(chunk.subarray(0, remaining));
        stdoutBytes += remaining;
        stdoutTruncated = true;
        child.kill();
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
    child.once("close", (code) => finish(undefined, code));

    timer = setTimeout(() => {
      child.kill();
      finish(new Error(`Process timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    timer.unref();
  });
}
