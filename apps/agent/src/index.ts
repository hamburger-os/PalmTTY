import path from "node:path";
import { configPathFromEnvironment, loadConfig } from "@palmtty/config";
import { buildApp } from "./app.js";
import { preflightRuntime } from "./preflight.js";
import { withDevelopmentTrustedOrigins } from "./development-origins.js";
import { describeServerBindError } from "./server-endpoint.js";
import { runSessionWorkerFromStdin } from "./session-worker.js";

function configPathFromArgs(): string {
  const index = process.argv.indexOf("--config");
  const explicitPath = index >= 0 ? process.argv[index + 1] : undefined;
  if (explicitPath) return path.resolve(explicitPath);
  return configPathFromEnvironment();
}

async function main() {
  if (process.argv.includes("--session-worker")) {
    await runSessionWorkerFromStdin();
    return;
  }

  const configPath = configPathFromArgs();
  const loadedConfig = await loadConfig(configPath);
  const config = process.argv.includes("--development")
    ? withDevelopmentTrustedOrigins(
        loadedConfig,
        process.env.PALMTTY_DEV_TRUSTED_ORIGINS
      )
    : loadedConfig;
  await preflightRuntime(config);

  if (config.server.unsafeAllowInsecureLan) {
    console.warn(
      "[PalmTTY] WARNING: unsafeAllowInsecureLan is enabled. " +
      "Do not expose this configuration to the Internet."
    );
  }

  if (process.argv.includes("--preflight")) {
    console.log(
      `[PalmTTY] preflight passed: ${configPath}`
    );
    return;
  }

  const app = await buildApp(config);
  try {
    await app.listen({ host: config.server.host, port: config.server.port });
  } catch (error) {
    await app.close().catch(() => undefined);
    throw new Error(
      describeServerBindError(config.server, error),
      { cause: error }
    );
  }
  console.log(`[PalmTTY] listening on ${config.server.host}:${config.server.port}`);
}

main().catch((error) => {
  console.error(
    "[PalmTTY] startup failed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
