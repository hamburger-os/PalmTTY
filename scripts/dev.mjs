import { spawn } from "node:child_process";
import os from "node:os";
import {
  configPathFromEnvironment,
  loadConfig,
  localAgentUrl
} from "../packages/config/dist/index.js";
import {
  DEFAULT_WEB_HOST,
  WEB_PORT,
  developmentWebOrigins
} from "./dev-network.mjs";

async function agentUrl() {
  if (process.env.PALMTTY_AGENT_URL) {
    return process.env.PALMTTY_AGENT_URL;
  }

  const config = await loadConfig(configPathFromEnvironment());
  return localAgentUrl(config);
}

async function main() {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) {
    throw new Error("pnpm executable path is unavailable in npm_execpath");
  }

  const target = await agentUrl();
  const webHost = process.env.PALMTTY_WEB_HOST ?? DEFAULT_WEB_HOST;
  const trustedOrigins = developmentWebOrigins(
    webHost,
    os.networkInterfaces()
  );
  const lanOrigins = trustedOrigins.filter((value) => (
    !value.includes("127.0.0.1") && !value.includes("localhost")
  ));

  console.log(`[PalmTTY] development proxy target: ${target}`);
  console.log(`[PalmTTY] development web listener: ${webHost}:${WEB_PORT}`);
  if (lanOrigins.length > 0) {
    console.log("[PalmTTY] LAN development URLs:");
    for (const value of lanOrigins) console.log(`  - ${value}`);
    if (process.platform === "win32") {
      console.log(
        "[PalmTTY] If another LAN device times out, allow Node.js/PalmTTY " +
        "TCP 5173 on Windows Private networks."
      );
    }
  } else if (webHost === DEFAULT_WEB_HOST) {
    console.warn(
      "[PalmTTY] no private IPv4 LAN address was detected; " +
      "loopback development access remains available."
    );
  }

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
        PALMTTY_AGENT_URL: target,
        PALMTTY_WEB_HOST: webHost,
        PALMTTY_DEV_TRUSTED_ORIGINS: JSON.stringify(trustedOrigins),
        PALMTTY_WINDOWS_SPAWN_TRACE:
          process.env.PALMTTY_WINDOWS_SPAWN_TRACE ??
          (process.platform === "win32" ? "1" : "0")
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
