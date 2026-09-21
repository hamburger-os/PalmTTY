import {
  configPathFromEnvironment,
  loadConfig
} from "@palmtty/config";
import { defineConfig } from "vite";

const DEFAULT_AGENT_URL = "http://127.0.0.1:7688";

function urlHost(host: string): string {
  const normalized = host.trim().replace(/^\[|\]$/g, "");
  if (normalized === "0.0.0.0") return "127.0.0.1";
  if (normalized === "::") return "[::1]";
  return normalized.includes(":") ? `[${normalized}]` : normalized;
}

async function developmentAgentUrl(): Promise<string> {
  if (process.env.PALMTTY_AGENT_URL) return process.env.PALMTTY_AGENT_URL;

  const config = await loadConfig(configPathFromEnvironment());
  return `http://${urlHost(config.server.host)}:${config.server.port}`;
}

export default defineConfig(async ({ command, mode }) => {
  const useRuntimeConfig = command === "serve" && mode !== "test" && !process.env.VITEST;
  const agent = useRuntimeConfig
    ? await developmentAgentUrl()
    : process.env.PALMTTY_AGENT_URL ?? DEFAULT_AGENT_URL;

  return {
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
  };
});
