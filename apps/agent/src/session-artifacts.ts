import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import {
  MAX_SESSION_ARTIFACT_BYTES,
  MAX_SESSION_ARTIFACTS,
  MAX_SESSION_ARTIFACT_TOTAL_BYTES,
  SessionArtifactIdSchema,
  SessionArtifactSchema,
  type SessionArtifact
} from "@palmtty/protocol";
import { z } from "zod";
import { readOpenedFileStableBounded } from "./bounded-file.js";
import { runBoundedProcess } from "./bounded-process.js";
import {
  readHostEnvironment,
  withoutEnvironmentKeys
} from "./host-environment.js";
import { inspectImageArtifact } from "./image-artifact.js";
import {
  resolveExecutable,
  type SessionLaunchRuntime
} from "./workspace-runtime.js";
import { listWorkerRecords } from "./worker-storage.js";

const ArtifactMetadataSchema = SessionArtifactSchema.extend({
  version: z.literal(1),
  storageName: z.string().regex(/^[A-Za-z0-9_-]+\.(?:png|jpg|webp|gif)$/)
}).strict();

type ArtifactMetadata = z.infer<typeof ArtifactMetadataSchema>;
type SessionLock = Promise<void>;

function artifactRoot(runtimeDir: string): string {
  return path.join(runtimeDir, "artifacts-v1");
}

function validSessionId(sessionId: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(sessionId);
}

function sessionDir(runtimeDir: string, sessionId: string): string {
  if (!validSessionId(sessionId)) throw new Error("Invalid Session ID");
  return path.join(artifactRoot(runtimeDir), sessionId);
}

function metadataPath(
  runtimeDir: string,
  sessionId: string,
  artifactId: string
): string {
  const id = SessionArtifactIdSchema.parse(artifactId);
  return path.join(sessionDir(runtimeDir, sessionId), `${id}.json`);
}

function publicArtifact(metadata: ArtifactMetadata): SessionArtifact {
  const { version: _version, storageName: _storageName, ...artifact } = metadata;
  return SessionArtifactSchema.parse(artifact);
}

function cleanName(value: string, extension: string): string {
  const leaf = value.split(/[\\/]/u).pop() ?? "";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/gu, "")
    .trim()
    .slice(0, 220);
  return cleaned || `image.${extension}`;
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
}

async function writePrivate(
  filePath: string,
  content: Buffer | string
): Promise<void> {
  await writeFile(filePath, content, { mode: 0o600, flag: "wx" });
  if (process.platform !== "win32") await chmod(filePath, 0o600);
}

async function wslTerminalPath(
  runtime: Extract<SessionLaunchRuntime, { kind: "wsl" }>,
  hostPath: string,
  sensitiveEnvironmentKeys: string[]
): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("WSL attachments are available only on Windows");
  }
  const environment = withoutEnvironmentKeys(
    await readHostEnvironment(),
    sensitiveEnvironmentKeys
  );
  const executable = await resolveExecutable("wsl.exe", {
    cwd: process.cwd(),
    env: environment
  });
  const distribution = runtime.distribution
    ? ["--distribution", runtime.distribution]
    : [];
  const result = await runBoundedProcess({
    executable,
    args: [
      ...distribution,
      "--exec",
      "/usr/bin/env",
      ...sensitiveEnvironmentKeys.flatMap((key) => ["-u", key]),
      "wslpath",
      "-a",
      "-u",
      hostPath
    ],
    cwd: process.cwd(),
    env: environment,
    timeoutMs: 5_000,
    maxStdoutBytes: 8 * 1024
  });
  if (result.code !== 0 || result.stdoutTruncated) {
    throw new Error(
      result.stderr.trim() || "Unable to map the attachment path into WSL"
    );
  }
  const mapped = result.stdout.toString("utf8").trim();
  if (!mapped.startsWith("/") || mapped.includes("\0")) {
    throw new Error("WSL returned an invalid attachment path");
  }
  return mapped;
}

export class SessionArtifactStore {
  private readonly locks = new Map<string, SessionLock>();

  constructor(readonly runtimeDir: string) {}

  async initialize(): Promise<void> {
    const root = artifactRoot(this.runtimeDir);
    await ensurePrivateDirectory(root);
    const records = await listWorkerRecords(this.runtimeDir);
    const retained = new Set(records.map((record) => record.sessionId));
    const entries = await readdir(root, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isDirectory() || retained.has(entry.name)) return;
      await rm(path.join(root, entry.name), { recursive: true, force: true });
    }));
  }

  async list(sessionId: string): Promise<SessionArtifact[]> {
    const metadata = await this.readAllMetadata(sessionId);
    return metadata
      .map(publicArtifact)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async upload(
    sessionId: string,
    launchRuntime: SessionLaunchRuntime,
    originalName: string,
    content: Buffer,
    sensitiveEnvironmentKeys: string[]
  ): Promise<SessionArtifact> {
    if (content.length < 1 || content.length > MAX_SESSION_ARTIFACT_BYTES) {
      throw new Error(
        `Attachments must be between 1 byte and ${MAX_SESSION_ARTIFACT_BYTES} bytes`
      );
    }

    const image = inspectImageArtifact(content);
    return this.withSessionLock(sessionId, async () => {
      const existing = await this.readAllMetadata(sessionId);
      if (existing.length >= MAX_SESSION_ARTIFACTS) {
        throw new Error(
          `A Session can retain at most ${MAX_SESSION_ARTIFACTS} attachments`
        );
      }
      const total = existing.reduce((sum, artifact) => sum + artifact.size, 0);
      if (total + content.length > MAX_SESSION_ARTIFACT_TOTAL_BYTES) {
        throw new Error("Session attachment storage limit exceeded");
      }

      const directory = sessionDir(this.runtimeDir, sessionId);
      await ensurePrivateDirectory(directory);
      const id = randomBytes(18).toString("base64url");
      const storageName = `${id}.${image.extension}`;
      const filePath = path.join(directory, storageName);
      const terminalPath = launchRuntime.kind === "wsl"
        ? await wslTerminalPath(
            launchRuntime,
            filePath,
            sensitiveEnvironmentKeys
          )
        : filePath;
      const metadata = ArtifactMetadataSchema.parse({
        version: 1,
        id,
        name: cleanName(originalName, image.extension),
        mime: image.mime,
        size: content.length,
        width: image.width,
        height: image.height,
        createdAt: new Date().toISOString(),
        terminalPath,
        storageName
      });

      await writePrivate(filePath, content);
      try {
        await writePrivate(
          metadataPath(this.runtimeDir, sessionId, id),
          `${JSON.stringify(metadata, null, 2)}\n`
        );
      } catch (error) {
        await unlink(filePath).catch(() => undefined);
        throw error;
      }

      return publicArtifact(metadata);
    });
  }

  async read(
    sessionId: string,
    artifactId: string
  ): Promise<{ artifact: SessionArtifact; content: Buffer }> {
    const metadata = await this.readMetadata(sessionId, artifactId);
    const filePath = path.join(
      sessionDir(this.runtimeDir, sessionId),
      metadata.storageName
    );
    const handle = await open(filePath, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size !== metadata.size) {
        throw new Error("Attachment content no longer matches its metadata");
      }
      const content = await readOpenedFileStableBounded(
        handle,
        metadata.size,
        MAX_SESSION_ARTIFACT_BYTES,
        "Attachment content"
      );
      return {
        artifact: publicArtifact(metadata),
        content
      };
    } finally {
      await handle.close();
    }
  }

  async delete(sessionId: string, artifactId: string): Promise<boolean> {
    return this.withSessionLock(sessionId, async () => {
      let metadata: ArtifactMetadata;
      try {
        metadata = await this.readMetadata(sessionId, artifactId);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
      await Promise.all([
        unlink(
          path.join(sessionDir(this.runtimeDir, sessionId), metadata.storageName)
        ).catch(() => undefined),
        unlink(metadataPath(this.runtimeDir, sessionId, artifactId))
          .catch(() => undefined)
      ]);
      return true;
    });
  }

  async removeSession(sessionId: string): Promise<void> {
    await this.withSessionLock(sessionId, async () => {
      await rm(sessionDir(this.runtimeDir, sessionId), {
        recursive: true,
        force: true
      });
    });
  }

  private async readMetadata(
    sessionId: string,
    artifactId: string
  ): Promise<ArtifactMetadata> {
    const source = await readFile(
      metadataPath(this.runtimeDir, sessionId, artifactId),
      "utf8"
    );
    return ArtifactMetadataSchema.parse(JSON.parse(source));
  }

  private async readAllMetadata(sessionId: string): Promise<ArtifactMetadata[]> {
    const directory = sessionDir(this.runtimeDir, sessionId);
    await ensurePrivateDirectory(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    const metadata: ArtifactMetadata[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        metadata.push(ArtifactMetadataSchema.parse(
          JSON.parse(await readFile(path.join(directory, entry.name), "utf8"))
        ));
      } catch {
        // Corrupt metadata is never exposed as an attachment.
      }
    }
    return metadata;
  }

  private async withSessionLock<T>(
    sessionId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    if (!validSessionId(sessionId)) throw new Error("Invalid Session ID");
    const previous = this.locks.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    this.locks.set(sessionId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(sessionId) === current) {
        this.locks.delete(sessionId);
      }
    }
  }
}
