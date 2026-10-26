import { createLocalAgentClient } from "./local-agent-client.mjs";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAutostartArgs, windowsAutostartPaths, WINDOWS_TASK_NAME } from "./autostart-core.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function runPnpm(args) {
  const cli = process.env.npm_execpath;
  if (!cli || !path.isAbsolute(cli)) throw new Error("Run this command through pnpm deploy:local.");
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`Deployment step failed: ${args[0]}`);
}
function startupCommand(action) {
  if (process.platform === "win32") {
    return spawnSync("schtasks.exe", [action === "stop" ? "/End" : "/Run", "/TN", WINDOWS_TASK_NAME], { windowsHide: true, stdio: "ignore" });
  }
  return spawnSync("systemctl", ["--user", action === "stop" ? "stop" : "start", "palmtty.service"], { stdio: "ignore" });
}
function hasInstalledStartup() {
  const result = process.platform === "win32"
    ? spawnSync("schtasks.exe", ["/Query", "/TN", WINDOWS_TASK_NAME], { windowsHide: true, stdio: "ignore" })
    : spawnSync("systemctl", ["--user", "cat", "palmtty.service"], { stdio: "ignore" });
  return result.status === 0;
}
async function main() {
  let args = process.argv.slice(2);
  if (args.length === 1 && ["-h", "--help"].includes(args[0])) {
    console.log("pnpm deploy:local [--config <path>] [--env-file <path>]\nBuild, preflight, install current-user startup, and verify configured applications.\nWindows: without arguments reuse the existing installation's config/env-file paths.");
    return;
  }
  if (!args.length && process.platform === "win32") {
    try {
      const manifest = JSON.parse(await readFile(windowsAutostartPaths().installation, "utf8"));
      args = ["--config", manifest.configPath, ...(manifest.envFile ? ["--env-file", manifest.envFile] : [])];
    } catch { /* A first installation uses explicit options or the standard config location. */ }
  }
  parseAutostartArgs(["install", ...args]);
  runPnpm(["install", "--frozen-lockfile"]);
  runPnpm(["build"]);
  const { configPathFromEnvironment, loadConfig, exposureOrigins } = await import("../packages/config/dist/index.js");
  const { loadEnvironmentFile } = await import("../apps/agent/dist/environment-file.js");
  const parsed = parseAutostartArgs(["install", ...args]);
  if (parsed.envFile) await loadEnvironmentFile(parsed.envFile);
  const config = await loadConfig(parsed.configPath ?? configPathFromEnvironment());
  const { provisionPrivateNetwork, exportPrivateNetworkSetup } = await import("./private-network.mjs");
  await provisionPrivateNetwork(config);
  const agentArgs = ["--config", parsed.configPath ?? configPathFromEnvironment(), ...(parsed.envFile ? ["--env-file", parsed.envFile] : [])];
  const preflight = () => spawnSync(process.execPath, [path.join(root, "apps/agent/dist/index.js"), "--preflight", ...agentArgs], { cwd: root, encoding: "utf8", windowsHide: true });
  let probe = preflight(), stopped = false;
  // Upgrade the registered user service, never kill a guessed port owner/PID.
  // Other preflight errors leave the current service untouched.
  const problems = (probe.stderr ?? "").split(/\r?\n/u).filter((line) => line.startsWith("- "));
  if (probe.status !== 0 && problems.length === 1 && problems[0].includes("already in use") && hasInstalledStartup()) {
    if (startupCommand("stop").status !== 0) throw new Error("Could not stop the registered user startup instance.");
    stopped = true;
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      probe = preflight();
      if (probe.status === 0) break;
    }
  }
  if (probe.status !== 0) {
    if (stopped) startupCommand("start");
    process.stderr.write(probe.stderr ?? "");
    throw new Error("Preflight failed; no unknown listener was stopped.");
  }
  try { runPnpm(["autostart", "install", ...args]); }
  catch (error) { if (stopped) startupCommand("start"); throw error; }
  const request = await createLocalAgentClient(config), origin = exposureOrigins(config)[0];
  const deadline = Date.now() + 11 * 60_000;
  let cookie;
  const seen = new Map();
  try {
    while (Date.now() < deadline) {
      try {
        if (!cookie && config.auth.enabled) {
          const response = await request("/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ token: process.env[config.auth.tokenEnv] }), signal: AbortSignal.timeout(5000) });
          if (response.ok) cookie = response.headers.get("set-cookie")?.split(";")[0];
          else if (response.status === 401) throw new Error("deployment_authentication_failed");
        }
        const response = await request("/api/v1/integrations", { headers: { origin, ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const { apps } = await response.json();
          let ready = true;
          for (const [id, entry] of Object.entries(config.integrations)) {
            if (entry.mode !== "managed" || !entry.autoStart) continue;
            const state = apps[id];
            const label = state.phase + (state.detail ? "/" + state.detail : "");
            if (seen.get(id) !== label) { console.log(`[PalmTTY] ${id}: ${label}`); seen.set(id, label); }
            if (state.phase === "failed") throw new Error("managed_application_failed:" + id + ":" + (state.detail ?? "unknown"));
            if (state.phase !== "running") ready = false;
          }
          if (ready) { await exportPrivateNetworkSetup(config); console.log("[PalmTTY] Local deployment verified. Test the same IP entries over home Wi-Fi and WireGuard on the actual device."); return; }
        }
      } catch (error) {
        if (/^(managed_application_failed|deployment_authentication_failed|local_agent_tls_validation_failed)/u.test(error.message)) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Deployment health check timed out.");
  } finally {
    if (cookie) await request("/api/v1/auth/logout", { method: "POST", headers: { origin, cookie }, signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  }
}
main().catch((error) => { console.error("[PalmTTY] " + error.message); process.exitCode = 1; });
