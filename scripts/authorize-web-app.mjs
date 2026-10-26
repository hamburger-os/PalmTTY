import { createLocalAgentClient } from "./local-agent-client.mjs";
import { readFile } from "node:fs/promises";
import { parseAutostartArgs, windowsAutostartPaths } from "./autostart-core.mjs";
import { configPathFromEnvironment, loadConfig, exposureOrigins } from "../packages/config/dist/index.js";
import { loadEnvironmentFile } from "../apps/agent/dist/environment-file.js";

async function main() {
  const [id, ...options] = process.argv.slice(2);
  if (!["vscodeWeb", "harness"].includes(id)) throw new Error("pnpm app:authorize <vscodeWeb|harness> [--config <path>] [--env-file <path>]");
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Private sign-in URLs may only be displayed in an explicitly invoked interactive terminal.");
  let args = options;
  if (!args.length && process.platform === "win32") {
    const manifest = JSON.parse(await readFile(windowsAutostartPaths().installation, "utf8"));
    args = ["--config", manifest.configPath, ...(manifest.envFile ? ["--env-file", manifest.envFile] : [])];
  }
  const parsed = parseAutostartArgs(["install", ...args]);
  if (parsed.envFile) await loadEnvironmentFile(parsed.envFile);
  const config = await loadConfig(parsed.configPath ?? configPathFromEnvironment());
  const request = await createLocalAgentClient(config), origin = exposureOrigins(config)[0];
  const login = await request("/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ token: process.env[config.auth.tokenEnv] }), signal: AbortSignal.timeout(5000) });
  if (!login.ok) throw new Error("Local operator authentication failed.");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Authenticated session unavailable.");
  try {
    const result = await request(`/api/v1/integrations/${id}/authorize`, { method: "POST", headers: { origin, cookie }, signal: AbortSignal.timeout(5000) });
    if (!result.ok) throw new Error("Application is not ready for authorization.");
    const { url } = await result.json();
    console.log("Private upstream sign-in URL (open locally; do not share or save):\n" + url);
  } finally {
    await request("/api/v1/auth/logout", { method: "POST", headers: { origin, cookie }, signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  }
}
main().catch((error) => { console.error("[PalmTTY] " + error.message); process.exitCode = 1; });
