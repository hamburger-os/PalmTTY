import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  configPathFromEnvironment, findOfficialVSCodeCli, loadConfig
} from "../packages/config/dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentEntry = path.join(root, "apps", "agent", "dist", "index.js");
export const DEFAULT_VSCODE_WEB_PORT = 8000;

/** Do not infer host network exposure from PalmTTY's LAN/reverse-proxy config. */
export function localVSCodeWebPort(config) {
  const entry = config.integrations.vscodeWeb;
  if (!entry) return DEFAULT_VSCODE_WEB_PORT;
  const uri = new URL(entry);
  if (uri.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(uri.hostname)) {
    return DEFAULT_VSCODE_WEB_PORT;
  }
  if (uri.pathname !== "/" || !uri.port) {
    throw new Error("Local integrations.vscodeWeb must be a loopback base URL with an explicit port.");
  }
  return Number(uri.port);
}

export function officialVSCodeWebArgs(port) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid VS Code Web port");
  }
  return ["serve-web", "--host", "127.0.0.1", "--port", String(port)];
}

/** Unlike cmd.exe string interpolation, an escaped PowerShell literal safely handles arbitrary user paths. */
export function windowsVSCodeCommand(cli, args) {
  const quoted = "'"+cli.replaceAll("'", "''")+"'";
  return "& " + quoted + " " + args.join(" ") + "; exit $LASTEXITCODE";
}

export function filteredVSCodeEnvironment(env, tokenEnv) {
  const result = { ...env };
  for (const name of Object.keys(result)) {
    if (name.toUpperCase().startsWith("PALMTTY_") ||
        name.toUpperCase() === tokenEnv.toUpperCase()) {
      delete result[name];
    }
  }
  return result;
}

function startOfficialCLI(cli, args, env) {
  if (process.platform !== "win32") {
    return spawn(cli, args, { stdio: "inherit", env, detached: true });
  }
  // code.cmd is a Windows command script, not a PE executable. Start it in
  // the current user's interactive session, without launching a system service.
  const powershell = path.win32.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
  );
  return spawn(powershell, ["-NoLogo", "-NoProfile", "-Command",
    windowsVSCodeCommand(cli, args)], {
    stdio: "inherit", env, windowsHide: true
  });
}

function exitObservation(child, label) {
  return new Promise((resolve) => {
    child.once("error", (error) => resolve({ label, error }));
    child.once("exit", (code, signal) => resolve({ label, code, signal }));
  });
}

async function stopOwnedChild(child, { preserveDetachedWorkers = false } = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    if (preserveDetachedWorkers) {
      // Terminal Session Workers deliberately outlive an Agent restart.
      // taskkill /T here would follow Agent's parent-child lineage and may
      // terminate those independently detached Workers.
      child.kill();
      return;
    }
    // VS Code's owned CLI wrapper may spawn its own server subprocesses.
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true, stdio: "ignore"
      });
      killer.once("error", resolve);
      killer.once("close", resolve);
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch { /* already exited */ }
  }
  // No stale timers/listeners: finish promptly after the child exits.
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      child.off("close", done);
      resolve();
    };
    const timer = setTimeout(done, 2500);
    child.once("close", done);
  });
  try { process.kill(-child.pid, "SIGKILL"); } catch { /* group exited */ }
}

/**
 * Local manual foreground helper only. Neither PalmTTY Agent nor any login
 * task/systemd service launches Microsoft VS Code Server automatically.
 * License prompt and upstream token authentication remain owned by VS Code.
 */
export async function main() {
  if (process.argv.length > 2) {
    if (process.argv.length === 3 &&
        ["-h", "--help"].includes(process.argv[2])) {
      console.log("Usage: pnpm start:with-vscode (interactive foreground only, after pnpm build)");
      return;
    }
    throw new Error("No extra arguments accepted. Configure integrations.vscodeWeb instead.");
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("VS Code Web joint launch requires an interactive foreground terminal; not permitted for autostart or CI.");
  }

  // Fail closed before starting either service; do not attach to unknown PIDs.
  await access(agentEntry);
  const config = await loadConfig(configPathFromEnvironment());
  const cli = await findOfficialVSCodeCli();
  if (!cli) {
    throw new Error("Official VS Code 'code' CLI not found. Install Microsoft VS Code and enable its CLI on PATH.");
  }
  const port = localVSCodeWebPort(config);
  console.log("[PalmTTY] starting interactive official VS Code Web on 127.0.0.1:" + port);
  console.log("[PalmTTY] VS Code Server will request license acceptance if necessary. Keep its own connection-token protection enabled.");
  console.log("[PalmTTY] local Web URL: http://127.0.0.1:" + port + "/ (not a phone-access URL)");
  console.log("[PalmTTY] use a separate HTTPS Origin and upstream authentication for remote access.");

  let signalNotify;
  const stopRequested = new Promise((resolve) => { signalNotify = resolve; });
  const onSigint = () => signalNotify({ label: "signal", signal: "SIGINT" });
  const onSigterm = () => signalNotify({ label: "signal", signal: "SIGTERM" });
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  let vscode;
  let agent;
  try {
    vscode = startOfficialCLI(
      cli, officialVSCodeWebArgs(port),
      filteredVSCodeEnvironment(process.env, config.auth.tokenEnv)
    );
    const vscodeExit = exitObservation(vscode, "VS Code Web");
    // The existing Agent is unchanged. Never share VS Code's stdin with it.
    agent = spawn(process.execPath, [agentEntry], {
      stdio: ["ignore", "inherit", "inherit"],
      env: process.env,
      windowsHide: true,
      detached: process.platform !== "win32"
    });
    const agentExit = exitObservation(agent, "PalmTTY Agent");
    const winner = await Promise.race([stopRequested, vscodeExit, agentExit]);
    if (winner.label === "signal") {
      console.log("[PalmTTY] stopping locally started processes...");
      process.exitCode = winner.signal === "SIGINT" ? 130 : 143;
    } else if (winner.error) {
      console.error("[PalmTTY] " + winner.label + " failed: " + winner.error.message);
      process.exitCode = 1;
    } else {
      console.error("[PalmTTY] " + winner.label + " exited (" +
        (winner.signal ?? winner.code ?? "unknown") + "); stopping joint session.");
      process.exitCode = winner.label === "PalmTTY Agent"
        ? (winner.code ?? 1) : 1;
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    await Promise.all([stopOwnedChild(agent, { preserveDetachedWorkers: true }), stopOwnedChild(vscode)]);
  }
}

if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[PalmTTY] joint launch failed: " + error.message);
    process.exitCode = 1;
  });
}
