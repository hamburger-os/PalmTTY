import path from "node:path";
import {
  configPathFromEnvironment,
  lanAgentUrls,
  loadConfig,
  localAgentUrl,
  serverBindHost
} from "@palmtty/config";
import { buildApp } from "./app.js";
import { parseDevelopmentTrustedOrigins } from "./development-origins.js";
import { loadEnvironmentFile } from "./environment-file.js";
import { preflightRuntime } from "./preflight.js";
import { describeServerBindError } from "./server-endpoint.js";
import { loadServerTlsOptions } from "./server-tls.js";
import { runSessionWorkerFromStdin } from "./session-worker.js";

function pathFromArgs(option: string): string | undefined {
  const index = process.argv.indexOf(option);
  if (index < 0) return undefined;
  const explicitPath = process.argv[index + 1];
  if (!explicitPath || explicitPath.startsWith("--")) {
    throw new Error(`Missing path after ${option}`);
  }
  return path.resolve(explicitPath);
}

function configPathFromArgs(): string {
  return pathFromArgs("--config") ?? configPathFromEnvironment();
}

async function main() {
  if (process.argv.includes("--session-worker")) {
    await runSessionWorkerFromStdin();
    return;
  }

  const environmentFilePath = pathFromArgs("--env-file");
  if (environmentFilePath) {
    await loadEnvironmentFile(environmentFilePath);
  }

  const configPath = configPathFromArgs();
  const config = await loadConfig(configPath);
  const development = process.argv.includes("--development");
  const developmentTrustedOrigins = development
    ? parseDevelopmentTrustedOrigins(process.env.PALMTTY_DEV_TRUSTED_ORIGINS)
    : [];

  await preflightRuntime(config);

  if (config.server.exposure.mode === "lan") {
    console.warn(
      "[PalmTTY] WARNING: LAN exposure uses unencrypted HTTP on private/overlay interfaces. " +
      "Use direct HTTPS or reverseProxy exposure for normal remote use."
    );
  }

  if (process.argv.includes("--preflight")) {
    console.log(`[PalmTTY] preflight passed: ${configPath}`);
    return;
  }

  const tls = await loadServerTlsOptions(config);
  const app = await buildApp(config, {
    additionalTrustedOrigins: developmentTrustedOrigins,
    ...(tls ? { https: tls } : {})
  });
  const host = serverBindHost(config);
  try {
    await app.listen({ host, port: config.server.port });
  } catch (error) {
    await app.close().catch(() => undefined);
    throw new Error(
      describeServerBindError({ host, port: config.server.port }, error),
      { cause: error }
    );
  }

  console.log(
    `[PalmTTY] listening on ${host}:${config.server.port} (${config.server.exposure.mode})`
  );
  console.log(`[PalmTTY] local URL: ${localAgentUrl(config)}`);
  if (config.server.exposure.mode === "lan") {
    const urls = lanAgentUrls(config);
    if (urls.length === 0) {
      console.warn("[PalmTTY] no private/overlay IPv4 LAN address was detected");
    } else {
      console.log("[PalmTTY] LAN URLs:");
      for (const url of urls) console.log(`  - ${url}`);
    }
  }
}

main().catch((error) => {
  console.error(
    "[PalmTTY] startup failed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
