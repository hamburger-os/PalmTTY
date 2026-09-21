import { spawn } from "node:child_process";
import {
  configPathFromEnvironment,
  loadConfig
} from "../packages/config/dist/index.js";

function urlHost(host) {
  const normalized = host.trim().replace(/^\[|\]$/g, "");
  if (normalized === "0.0.0.0") return "127.0.0.1";
  if (normalized === "::") return "[::1]";
  return normalized.includes(":") ? `[${normalized}]` : normalized;
}

async function agentUrl() {
  if (process.env.PALMTTY_AGENT_URL) {
    return process.env.PALMTTY_AGENT_URL;
  }

  const config = await loadConfig(configPathFromEnvironment());
  return `http://${urlHost(config.server.host)}:${config.server.port}`;
}

async function main() {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) {
    throw new Error("pnpm executable path is unavailable in npm_execpath");
  }

  const target = await agentUrl();
  console.log(`[PalmTTY] development proxy target: ${target}`);

  const child = spawn(
    process.execPath,
    [
      pnpmCli,
      "--parallel",
      "--filter",
      "@palmtty/agent",
      "--filter",
      "@palmtty/web",
      "dev"
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PALMTTY_AGENT_URL: target
      }
    }
  );

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  if (result.signal) {
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.code ?? 1;
}

main().catch((error) => {
  console.error(
    "[PalmTTY] development startup failed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
