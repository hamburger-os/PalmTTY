import { defineConfig } from "vite";

const agent = process.env.PALMTTY_AGENT_URL ?? "http://127.0.0.1:7688";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: agent,
        changeOrigin: false,
        ws: true
      }
    }
  }
});
