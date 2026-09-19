import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "@palmtty/config";
import { buildApp } from "./app.js";
import { assertSecureExposure } from "./security.js";

function defaultConfigPath(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), "PalmTTY", "config.yaml");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "PalmTTY", "config.yaml");
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "palmtty", "config.yaml");
}

function configPathFromArgs(): string {
  const index = process.argv.indexOf("--config");
  const explicitPath = index >= 0 ? process.argv[index + 1] : undefined;
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.PALMTTY_CONFIG) return path.resolve(process.env.PALMTTY_CONFIG);
  return defaultConfigPath();
}

async function validateWorkspaceDirectories(config: Awaited<ReturnType<typeof loadConfig>>) {
  for (const workspace of config.workspaces) {
    const info = await stat(workspace.cwd);
    if (!info.isDirectory()) throw new Error(`Workspace ${workspace.id} is not a directory: ${workspace.cwd}`);
  }
}

async function main() {
  const configPath = configPathFromArgs();
  const config = await loadConfig(configPath);
  assertSecureExposure(config);
  await validateWorkspaceDirectories(config);

  if (config.server.unsafeAllowInsecureLan) {
    console.warn("[PalmTTY] WARNING: unsafeAllowInsecureLan is enabled. Do not expose this configuration to the Internet.");
  }

  const app = await buildApp(config);
  await app.listen({ host: config.server.host, port: config.server.port });
  console.log(`[PalmTTY] listening on ${config.server.host}:${config.server.port}`);
}

main().catch((error) => {
  console.error("[PalmTTY] startup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
