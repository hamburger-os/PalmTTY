import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: process.platform === "win32"
    ? {
        // Windows CI exercises several process-heavy integration suites at once.
        // Cap worker concurrency and leave enough time for detached Worker/ConPTY
        // cleanup so scheduler contention does not cascade into unrelated tests.
        maxWorkers: 2,
        testTimeout: 15_000,
        hookTimeout: 20_000
      }
    : {},
  resolve: {
    alias: {
      "@palmtty/config": fileURLToPath(new URL("../../packages/config/src/index.ts", import.meta.url)),
      "@palmtty/protocol": fileURLToPath(new URL("../../packages/protocol/src/index.ts", import.meta.url))
    }
  }
});
