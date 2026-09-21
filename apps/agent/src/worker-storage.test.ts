import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKER_PROTOCOL_VERSION } from "./worker-protocol.js";
import {
  defaultRuntimeDir,
  WORKER_RUNTIME_GENERATION
} from "./worker-storage.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Worker runtime storage generation", () => {
  it("tracks the private Worker IPC generation", () => {
    expect(WORKER_RUNTIME_GENERATION).toBe(
      `runtime-v${WORKER_PROTOCOL_VERSION}`
    );
    expect(path.basename(defaultRuntimeDir())).toBe(
      WORKER_RUNTIME_GENERATION
    );
  });

  it("versions XDG runtime state instead of using an unversioned directory", () => {
    if (process.platform === "win32" || process.platform === "darwin") return;

    vi.stubEnv("XDG_RUNTIME_DIR", "/tmp/palmtty-xdg-runtime");

    expect(defaultRuntimeDir()).toBe(
      path.join(
        "/tmp/palmtty-xdg-runtime",
        "palmtty",
        WORKER_RUNTIME_GENERATION
      )
    );
  });
});
