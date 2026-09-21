import path from "node:path";
import { describe, expect, it } from "vitest";
import { WORKER_PROTOCOL_VERSION } from "./worker-protocol.js";
import {
  defaultRuntimeDir,
  WORKER_RUNTIME_GENERATION
} from "./worker-storage.js";

describe("Worker runtime storage generation", () => {
  it("tracks the private Worker IPC generation", () => {
    expect(WORKER_RUNTIME_GENERATION).toBe(
      `runtime-v${WORKER_PROTOCOL_VERSION}`
    );
    expect(path.basename(defaultRuntimeDir())).toBe(
      WORKER_RUNTIME_GENERATION
    );
  });
});
