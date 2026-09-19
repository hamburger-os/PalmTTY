import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

export const WorkerRecordSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(16).max(128),
  workspaceId: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  endpointId: z.string().min(16).max(128),
  workerPid: z.number().int().positive(),
  shellPid: z.number().int().positive()
});
export type WorkerRecord = z.infer<typeof WorkerRecordSchema>;

export function defaultRuntimeDir(): string {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? os.homedir();
    return path.join(base, "PalmTTY", "runtime-v1");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "PalmTTY", "runtime-v1");
  }
  const runtime = process.env.XDG_RUNTIME_DIR;
  return runtime
    ? path.join(runtime, "palmtty")
    : path.join(os.homedir(), ".local", "state", "palmtty", "runtime-v1");
}

export function sessionsDir(runtimeDir: string): string {
  return path.join(runtimeDir, "sessions");
}

export function secretsDir(runtimeDir: string): string {
  return path.join(runtimeDir, "secrets");
}

export function socketsDir(runtimeDir: string): string {
  return path.join(runtimeDir, "sockets");
}

export function workerRecordPath(runtimeDir: string, sessionId: string): string {
  return path.join(sessionsDir(runtimeDir), `${sessionId}.json`);
}

export function workerSecretPath(runtimeDir: string, sessionId: string): string {
  return path.join(secretsDir(runtimeDir), `${sessionId}.secret`);
}

export function workerEndpoint(runtimeDir: string, endpointId: string): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\palmtty-${endpointId}`;
  }
  const endpoint = path.join(socketsDir(runtimeDir), `${endpointId}.sock`);
  if (Buffer.byteLength(endpoint, "utf8") > 100) {
    throw new Error("PalmTTY runtime path is too long for a Unix domain socket");
  }
  return endpoint;
}

export async function ensureRuntimeLayout(runtimeDir: string): Promise<void> {
  for (const directory of [
    runtimeDir,
    sessionsDir(runtimeDir),
    secretsDir(runtimeDir),
    socketsDir(runtimeDir)
  ]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      await chmod(directory, 0o700);
    }
  }
}

async function writePrivateAtomic(filePath: string, content: string): Promise<void> {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
  );
  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  if (process.platform !== "win32") await chmod(tempPath, 0o600);
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  if (process.platform !== "win32") await chmod(filePath, 0o600);
}

export async function writeWorkerSecret(
  runtimeDir: string,
  sessionId: string,
  secret: string
): Promise<void> {
  await writePrivateAtomic(workerSecretPath(runtimeDir, sessionId), secret);
}

export async function writeWorkerRecord(
  runtimeDir: string,
  record: WorkerRecord
): Promise<void> {
  await writePrivateAtomic(
    workerRecordPath(runtimeDir, record.sessionId),
    `${JSON.stringify(WorkerRecordSchema.parse(record), null, 2)}\n`
  );
}

export async function readWorkerSecret(
  runtimeDir: string,
  sessionId: string
): Promise<string> {
  return (await readFile(workerSecretPath(runtimeDir, sessionId), "utf8")).trim();
}

export async function readWorkerRecord(
  runtimeDir: string,
  sessionId: string
): Promise<WorkerRecord> {
  const source = await readFile(workerRecordPath(runtimeDir, sessionId), "utf8");
  return WorkerRecordSchema.parse(JSON.parse(source));
}

export async function listWorkerRecords(runtimeDir: string): Promise<WorkerRecord[]> {
  await ensureRuntimeLayout(runtimeDir);
  const entries = await readdir(sessionsDir(runtimeDir), { withFileTypes: true });
  const records: WorkerRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(sessionsDir(runtimeDir), entry.name);
    try {
      records.push(WorkerRecordSchema.parse(JSON.parse(await readFile(filePath, "utf8"))));
    } catch {
      await unlink(filePath).catch(() => undefined);
    }
  }
  return records;
}

export async function removeWorkerState(
  runtimeDir: string,
  record: Pick<WorkerRecord, "sessionId" | "endpointId">
): Promise<void> {
  await Promise.all([
    unlink(workerRecordPath(runtimeDir, record.sessionId)).catch(() => undefined),
    unlink(workerSecretPath(runtimeDir, record.sessionId)).catch(() => undefined),
    process.platform === "win32"
      ? Promise.resolve()
      : unlink(workerEndpoint(runtimeDir, record.endpointId)).catch(() => undefined)
  ]);
}
