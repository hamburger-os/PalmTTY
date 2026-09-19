import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@palmtty/config": fileURLToPath(new URL("../../packages/config/src/index.ts", import.meta.url)),
      "@palmtty/protocol": fileURLToPath(new URL("../../packages/protocol/src/index.ts", import.meta.url))
    }
  }
});
