import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { REMOTE_APP_WORKER_PROTOCOL_VERSION } from "./remote-app-worker-protocol.js";

export const REMOTE_APP_RUNTIME_GENERATION =
  `app-runtime-v${REMOTE_APP_WORKER_PROTOCOL_VERSION}` as const;

export const RemoteAppWorkerRecordSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(16).max(128),
  workspaceId: z.string().min(1).max(64),
  profileId: z.string().min(1).max(64),
  profileName: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  endpointId: z.string().min(16).max(128),
  workerPid: z.number().int().positive(),
  appPid: z.number().int().positive()
}).strict();
export type RemoteAppWorkerRecord = z.infer<typeof RemoteAppWorkerRecordSchema>;

export function defaultRemoteAppRuntimeDir(): string {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? os.homedir();
    return path.join(base, "PalmTTY", REMOTE_APP_RUNTIME_GENERATION);
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "PalmTTY",
      REMOTE_APP_RUNTIME_GENERATION
    );
  }
  const runtime = process.env.XDG_RUNTIME_DIR;
  return runtime
    ? path.join(runtime, "palmtty", REMOTE_APP_RUNTIME_GENERATION)
    : path.join(
        os.homedir(),
        ".local",
        "state",
        "palmtty",
        REMOTE_APP_RUNTIME_GENERATION
      );
}

function sessionsDir(runtimeDir: string): string {
  return path.join(runtimeDir, "sessions");
}

function secretsDir(runtimeDir: string): string {
  return path.join(runtimeDir, "secrets");
}

function socketsDir(runtimeDir: string): string {
  return path.join(runtimeDir, "sockets");
}

export function remoteAppRecordPath(runtimeDir: string, sessionId: string): string {
  return path.join(sessionsDir(runtimeDir), `${sessionId}.json`);
}

export function remoteAppSecretPath(runtimeDir: string, sessionId: string): string {
  return path.join(secretsDir(runtimeDir), `${sessionId}.secret`);
}

export function remoteAppEndpoint(runtimeDir: string, endpointId: string): string {
  if (process.platform === "win32") return `\\\\.\\pipe\\palmtty-app-${endpointId}`;
  return path.join(socketsDir(runtimeDir), `${endpointId}.sock`);
}

async function atomicWrite(filePath: string, content: string, mode: number): Promise<void> {
  const temporary = `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode });
    if (process.platform !== "win32") await chmod(temporary, mode);
    await rename(temporary, filePath);
    if (process.platform !== "win32") await chmod(filePath, mode);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function ensureRemoteAppRuntimeLayout(runtimeDir: string): Promise<void> {
  await Promise.all([
    mkdir(sessionsDir(runtimeDir), { recursive: true, mode: 0o700 }),
    mkdir(secretsDir(runtimeDir), { recursive: true, mode: 0o700 }),
    mkdir(socketsDir(runtimeDir), { recursive: true, mode: 0o700 })
  ]);
  if (process.platform !== "win32") {
    await Promise.all([
      chmod(runtimeDir, 0o700),
      chmod(sessionsDir(runtimeDir), 0o700),
      chmod(secretsDir(runtimeDir), 0o700),
      chmod(socketsDir(runtimeDir), 0o700)
    ]);
  }
}

export async function writeRemoteAppRecord(
  runtimeDir: string,
  record: RemoteAppWorkerRecord
): Promise<void> {
  const parsed = RemoteAppWorkerRecordSchema.parse(record);
  await atomicWrite(
    remoteAppRecordPath(runtimeDir, parsed.sessionId),
    `${JSON.stringify(parsed, null, 2)}\n`,
    0o600
  );
}

export async function writeRemoteAppSecret(
  runtimeDir: string,
  sessionId: string,
  secret: string
): Promise<void> {
  if (secret.length < 32 || secret.length > 256) {
    throw new Error("Remote App Worker secret has an invalid length");
  }
  await atomicWrite(remoteAppSecretPath(runtimeDir, sessionId), `${secret}\n`, 0o600);
}

export async function readRemoteAppRecord(
  runtimeDir: string,
  sessionId: string
): Promise<RemoteAppWorkerRecord> {
  return RemoteAppWorkerRecordSchema.parse(
    JSON.parse(await readFile(remoteAppRecordPath(runtimeDir, sessionId), "utf8"))
  );
}

export async function readRemoteAppSecret(
  runtimeDir: string,
  sessionId: string
): Promise<string> {
  const secret = (await readFile(remoteAppSecretPath(runtimeDir, sessionId), "utf8")).trim();
  if (secret.length < 32 || secret.length > 256) {
    throw new Error("Remote App Worker secret is invalid");
  }
  return secret;
}

export async function listRemoteAppRecords(
  runtimeDir: string
): Promise<RemoteAppWorkerRecord[]> {
  const entries = await readdir(sessionsDir(runtimeDir), { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  );
  const records: RemoteAppWorkerRecord[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      records.push(
        RemoteAppWorkerRecordSchema.parse(
          JSON.parse(await readFile(path.join(sessionsDir(runtimeDir), entry.name), "utf8"))
        )
      );
    } catch {
      // Corrupt state is intentionally not adopted. It remains on disk for
      // operator inspection instead of becoming process-kill authority.
    }
  }
  return records;
}

export async function cleanupDanglingRemoteAppState(runtimeDir: string): Promise<void> {
  await ensureRemoteAppRuntimeLayout(runtimeDir);
  const records = await listRemoteAppRecords(runtimeDir);
  const liveIds = new Set(records.map((record) => record.sessionId));
  const liveEndpoints = new Set(records.map((record) => record.endpointId));
  const cutoff = Date.now() - 60_000;

  for (const entry of await readdir(secretsDir(runtimeDir), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".secret")) continue;
    const sessionId = entry.name.slice(0, -".secret".length);
    if (liveIds.has(sessionId)) continue;
    const filePath = path.join(secretsDir(runtimeDir), entry.name);
    const info = await stat(filePath).catch(() => undefined);
    if (info && info.mtimeMs <= cutoff) await unlink(filePath).catch(() => undefined);
  }

  if (process.platform !== "win32") {
    for (const entry of await readdir(socketsDir(runtimeDir), { withFileTypes: true })) {
      if (!entry.name.endsWith(".sock")) continue;
      const endpointId = entry.name.slice(0, -".sock".length);
      if (liveEndpoints.has(endpointId)) continue;
      const filePath = path.join(socketsDir(runtimeDir), entry.name);
      const info = await stat(filePath).catch(() => undefined);
      if (info && info.mtimeMs <= cutoff) await unlink(filePath).catch(() => undefined);
    }
  }
}

export async function removeRemoteAppWorkerState(
  runtimeDir: string,
  record: Pick<RemoteAppWorkerRecord, "sessionId" | "endpointId">
): Promise<void> {
  await Promise.all([
    unlink(remoteAppRecordPath(runtimeDir, record.sessionId)).catch(() => undefined),
    unlink(remoteAppSecretPath(runtimeDir, record.sessionId)).catch(() => undefined),
    process.platform === "win32"
      ? Promise.resolve()
      : unlink(remoteAppEndpoint(runtimeDir, record.endpointId)).catch(() => undefined)
  ]);
}
