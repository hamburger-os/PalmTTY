import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionLaunchRuntime } from "./workspace-runtime.js";
import { SessionArtifactStore } from "./session-artifacts.js";

const roots = new Set<string>();

function png(width = 64, height = 48): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ]).copy(buffer);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

afterEach(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
  roots.clear();
});

describe("SessionArtifactStore", () => {
  it("persists bounded private image attachments and removes them with the Session", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-artifacts-"));
    roots.add(runtimeDir);
    const store = new SessionArtifactStore(runtimeDir);
    await store.initialize();

    const launchRuntime: SessionLaunchRuntime = { kind: "host" };
    const sessionId = "abcdefghijklmnopqr";
    const created = await store.upload(
      sessionId,
      launchRuntime,
      "../screen shot.png",
      png(),
      []
    );

    expect(created).toMatchObject({
      name: "screen shot.png",
      mime: "image/png",
      width: 64,
      height: 48
    });
    expect(path.isAbsolute(created.terminalPath)).toBe(true);

    const listed = await store.list(sessionId);
    expect(listed).toEqual([created]);

    const loaded = await store.read(sessionId, created.id);
    expect(loaded.content).toEqual(png());

    expect(await store.delete(sessionId, created.id)).toBe(true);
    expect(await store.list(sessionId)).toEqual([]);

    const second = await store.upload(
      sessionId,
      launchRuntime,
      "again.png",
      png(20, 10),
      []
    );
    expect(second.width).toBe(20);
    await store.removeSession(sessionId);
    expect(await store.list(sessionId)).toEqual([]);
  });

  it("rejects content that only claims to be an image by filename", async () => {
    const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-artifacts-"));
    roots.add(runtimeDir);
    const store = new SessionArtifactStore(runtimeDir);
    await store.initialize();

    const launchRuntime: SessionLaunchRuntime = { kind: "host" };
    await expect(store.upload(
      "abcdefghijklmnopqr",
      launchRuntime,
      "fake.png",
      Buffer.from("<svg></svg>"),
      []
    )).rejects.toThrow(/PNG, JPEG, WebP, and GIF/);
  });
});
