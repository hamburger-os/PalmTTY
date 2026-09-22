import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LINUX_UNIT_NAME,
  WINDOWS_TASK_NAME,
  buildSystemdUserUnit,
  buildWindowsTaskXml,
  defaultConfigPath,
  defaultLinuxUnitPath,
  parseAutostartArgs
} from "./autostart-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const agentPath = path.join(repoRoot, "apps", "agent", "dist", "index.js");

function run(command, args, { acceptedExitCodes = [0] } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (!acceptedExitCodes.includes(result.status ?? -1)) {
    const details = [result.stderr?.trim(), result.stdout?.trim()].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}${details ? `\n${details}` : ""}`);
  }
  return result;
}

async function requireRegularFile(filePath, label) {
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
  if (!info.isFile()) throw new Error(`${label} must be a regular file: ${filePath}`);
  return info;
}

async function resolveInputs(options) {
  const configPath = options.configPath ?? path.resolve(process.env.PALMTTY_CONFIG ?? defaultConfigPath());
  await requireRegularFile(agentPath, "Built PalmTTY Agent");
  await requireRegularFile(configPath, "PalmTTY config");
  if (options.envFile) await requireRegularFile(options.envFile, "Environment file");
  return { configPath, envFile: options.envFile };
}

async function validateLinuxEnvFilePermissions(envFile) {
  if (!envFile) return;
  const info = await requireRegularFile(envFile, "Environment file");
  if ((info.mode & 0o077) !== 0) {
    throw new Error(`Linux environment file must not be group/world accessible (chmod 600): ${envFile}`);
  }
}

function currentWindowsSid() {
  const result = run("whoami.exe", ["/user", "/fo", "csv", "/nh"]);
  const match = result.stdout.match(/S-[0-9]+(?:-[0-9]+)+/u);
  if (!match) throw new Error("Unable to resolve the current Windows user SID");
  return match[0];
}

function warnRollbackFailure(action, error) {
  console.warn(
    `[PalmTTY] autostart rollback warning (${action}): ${error instanceof Error ? error.message : error}`
  );
}

function runRollback(action, command, args, options) {
  try {
    run(command, args, options);
  } catch (error) {
    warnRollbackFailure(action, error);
  }
}

async function installWindows(inputs) {
  const userSid = currentWindowsSid();
  const xml = buildWindowsTaskXml({
    userSid,
    nodePath: process.execPath,
    agentPath,
    repoRoot,
    configPath: inputs.configPath,
    envFile: inputs.envFile
  });
  const tempPath = path.join(os.tmpdir(), `palmtty-task-${randomUUID()}.xml`);
  await writeFile(tempPath, `\ufeff${xml}`, { encoding: "utf16le", mode: 0o600 });
  try {
    run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], { acceptedExitCodes: [0, 1] });
    run("schtasks.exe", ["/Create", "/TN", WINDOWS_TASK_NAME, "/XML", tempPath, "/F"]);
    run("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
  console.log(`[PalmTTY] installed Windows sign-in task: ${WINDOWS_TASK_NAME}`);
  console.log(`[PalmTTY] config: ${inputs.configPath}`);
  if (inputs.envFile) console.log(`[PalmTTY] environment file: ${inputs.envFile}`);
}

function statusWindows() {
  const result = run("schtasks.exe", ["/Query", "/TN", WINDOWS_TASK_NAME, "/FO", "LIST", "/V"]);
  process.stdout.write(result.stdout);
}

function restartWindows() {
  run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], { acceptedExitCodes: [0, 1] });
  run("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
  console.log(`[PalmTTY] restarted Windows sign-in task: ${WINDOWS_TASK_NAME}`);
}

function uninstallWindows() {
  run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], { acceptedExitCodes: [0, 1] });
  run("schtasks.exe", ["/Delete", "/TN", WINDOWS_TASK_NAME, "/F"]);
  console.log(`[PalmTTY] removed Windows sign-in task: ${WINDOWS_TASK_NAME}`);
}

async function installLinux(inputs) {
  await validateLinuxEnvFilePermissions(inputs.envFile);
  const unitPath = defaultLinuxUnitPath();
  const unit = buildSystemdUserUnit({
    nodePath: process.execPath,
    agentPath,
    repoRoot,
    configPath: inputs.configPath,
    envFile: inputs.envFile
  });
  await mkdir(path.dirname(unitPath), { recursive: true });
  let previousUnit;
  try {
    previousUnit = await readFile(unitPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const previousEnabled = run(
    "systemctl",
    ["--user", "is-enabled", LINUX_UNIT_NAME],
    { acceptedExitCodes: [0, 1, 3, 4] }
  ).stdout.trim() === "enabled";
  const previousActive = run(
    "systemctl",
    ["--user", "is-active", LINUX_UNIT_NAME],
    { acceptedExitCodes: [0, 1, 3, 4] }
  ).stdout.trim() === "active";

  const tempPath = `${unitPath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, unit, { encoding: "utf8", mode: 0o644 });
  await rename(tempPath, unitPath);
  try {
    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", LINUX_UNIT_NAME]);
    run("systemctl", ["--user", "restart", LINUX_UNIT_NAME]);
  } catch (error) {
    if (previousUnit === undefined) await rm(unitPath, { force: true });
    else await writeFile(unitPath, previousUnit, { encoding: "utf8", mode: 0o644 });

    runRollback("daemon-reload", "systemctl", ["--user", "daemon-reload"], { acceptedExitCodes: [0, 1] });
    if (previousUnit === undefined || !previousEnabled) {
      runRollback("disable restored unit", "systemctl", ["--user", "disable", LINUX_UNIT_NAME], { acceptedExitCodes: [0, 1, 4, 5] });
    } else {
      runRollback("enable restored unit", "systemctl", ["--user", "enable", LINUX_UNIT_NAME], { acceptedExitCodes: [0, 1] });
    }
    if (previousUnit !== undefined && previousActive) {
      runRollback("restart restored unit", "systemctl", ["--user", "restart", LINUX_UNIT_NAME], { acceptedExitCodes: [0, 1, 5] });
    }
    throw error;
  }
  console.log(`[PalmTTY] installed systemd user service: ${unitPath}`);
  console.log(`[PalmTTY] config: ${inputs.configPath}`);
  if (inputs.envFile) console.log(`[PalmTTY] environment file: ${inputs.envFile}`);
}

function linuxServiceState(action, acceptedExitCodes) {
  const result = run("systemctl", ["--user", action, LINUX_UNIT_NAME], { acceptedExitCodes });
  const state = result.stdout.trim();
  if (!state && result.stderr.trim()) {
    throw new Error(`systemctl --user ${action} could not determine ${LINUX_UNIT_NAME} state: ${result.stderr.trim()}`);
  }
  return state || "unknown";
}

function statusLinux() {
  const enabled = linuxServiceState("is-enabled", [0, 1, 3, 4]);
  const active = linuxServiceState("is-active", [0, 1, 3, 4]);
  console.log(`[PalmTTY] ${LINUX_UNIT_NAME}: enabled=${enabled}, active=${active}`);
}

function restartLinux() {
  run("systemctl", ["--user", "restart", LINUX_UNIT_NAME]);
  console.log(`[PalmTTY] restarted systemd user service: ${LINUX_UNIT_NAME}`);
}

async function uninstallLinux() {
  run("systemctl", ["--user", "disable", "--now", LINUX_UNIT_NAME], { acceptedExitCodes: [0, 1, 4, 5] });
  const unitPath = defaultLinuxUnitPath();
  await rm(unitPath, { force: true });
  run("systemctl", ["--user", "daemon-reload"]);
  console.log(`[PalmTTY] removed systemd user service: ${unitPath}`);
}

async function main() {
  const options = parseAutostartArgs(process.argv.slice(2));
  if (process.platform !== "win32" && process.platform !== "linux") {
    throw new Error(`Autostart is supported on Windows and Linux; current platform is ${process.platform}`);
  }

  if (options.command === "status") {
    if (process.platform === "win32") statusWindows();
    else statusLinux();
    return;
  }

  if (options.command === "restart") {
    if (process.platform === "win32") restartWindows();
    else restartLinux();
    return;
  }

  if (options.command === "uninstall") {
    if (process.platform === "win32") uninstallWindows();
    else await uninstallLinux();
    return;
  }

  await access(repoRoot);
  const inputs = await resolveInputs(options);
  if (process.platform === "win32") await installWindows(inputs);
  else await installLinux(inputs);
}

main().catch((error) => {
  console.error(`[PalmTTY] autostart failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
