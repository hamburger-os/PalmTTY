import { spawn } from "node:child_process";
import os from "node:os";
import {
  configPathFromEnvironment,
  loadConfig,
  localAgentUrl
} from "../packages/config/dist/index.js";

const WEB_PORT = 5173;
const DEFAULT_WEB_HOST = "0.0.0.0";

function isPrivateIpv4(address) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function privateLanIpv4Addresses() {
  const addresses = new Set();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const ipv4 = entry.family === "IPv4" || entry.family === 4;
      if (!ipv4 || entry.internal || !isPrivateIpv4(entry.address)) continue;
      addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}

function origin(host) {
  const formatted = host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;
  return `http://${formatted}:${WEB_PORT}`;
}

function developmentWebOrigins(host) {
  const origins = new Set([
    origin("127.0.0.1"),
    origin("localhost")
  ]);

  if (host === "0.0.0.0" || host === "::") {
    for (const address of privateLanIpv4Addresses()) {
      origins.add(origin(address));
    }
  } else {
    origins.add(origin(host));
  }

  return [...origins];
}

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
  const trustedOrigins = developmentWebOrigins(webHost);
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
