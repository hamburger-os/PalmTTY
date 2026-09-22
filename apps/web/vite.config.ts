import { defineConfig } from "vite";

const agent = process.env.PALMTTY_AGENT_URL ?? "http://127.0.0.1:17688";
const host = process.env.PALMTTY_WEB_HOST ?? "0.0.0.0";

export default defineConfig({
  server: {
    host,
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
