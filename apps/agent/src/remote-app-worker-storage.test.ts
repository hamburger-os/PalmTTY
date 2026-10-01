import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOTE_APP_WORKER_PROTOCOL_VERSION } from "./remote-app-worker-protocol.js";
import {
  defaultRemoteAppRuntimeDir,
  ensureRemoteAppRuntimeLayout,
  listRemoteAppRecords,
  readRemoteAppRecord,
  readRemoteAppSecret,
  REMOTE_APP_RUNTIME_GENERATION,
  removeRemoteAppWorkerState,
  writeRemoteAppRecord,
  writeRemoteAppSecret
} from "./remote-app-worker-storage.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Remote App Worker storage", () => {
  it("keeps a generation separate from terminal Worker state", () => {
    expect(REMOTE_APP_RUNTIME_GENERATION).toBe(
      `app-runtime-v${REMOTE_APP_WORKER_PROTOCOL_VERSION}`
    );
    expect(path.basename(defaultRemoteAppRuntimeDir())).toBe(
      REMOTE_APP_RUNTIME_GENERATION
    );
  });

  it("versions XDG Remote App state", () => {
    if (process.platform === "win32" || process.platform === "darwin") return;
    vi.stubEnv("XDG_RUNTIME_DIR", "/tmp/palmtty-xdg-runtime");

    expect(defaultRemoteAppRuntimeDir()).toBe(
      path.join(
        "/tmp/palmtty-xdg-runtime",
        "palmtty",
        REMOTE_APP_RUNTIME_GENERATION
      )
    );
  });

  it("round-trips authenticated recovery state", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-app-worker-"));
    try {
      await ensureRemoteAppRuntimeLayout(root);
      const record = {
        version: 1 as const,
        sessionId: "remote-app-session-123456789",
        workspaceId: "workspace",
        profileId: "codex-desktop",
        profileName: "Codex Desktop",
        createdAt: "2026-09-30T00:00:00.000Z",
        endpointId: "remote-app-endpoint-123456789",
        workerPid: 1234,
        appPid: 5678
      };
      await writeRemoteAppSecret(root, record.sessionId, "s".repeat(48));
      await writeRemoteAppRecord(root, record);

      expect(await readRemoteAppSecret(root, record.sessionId)).toBe("s".repeat(48));
      expect(await readRemoteAppRecord(root, record.sessionId)).toEqual(record);
      expect(await listRemoteAppRecords(root)).toEqual([record]);

      await removeRemoteAppWorkerState(root, record);
      expect(await listRemoteAppRecords(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
