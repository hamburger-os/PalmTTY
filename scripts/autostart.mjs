import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  exposureOrigins,
  lanAgentUrls,
  loadConfig,
  localAgentUrl,
  serverBindHost
} from "../packages/config/dist/index.js";
import {
  LINUX_UNIT_NAME,
  WINDOWS_TASK_NAME,
  buildSystemdUserUnit,
  buildWindowsHostCompilePowerShellCommand,
  buildWindowsInstallationManifest,
  buildWindowsTaskStatusPowerShellCommand,
  buildWindowsTaskXml,
  defaultConfigPath,
  defaultLinuxUnitPath,
  defaultWindowsPowerShellPath,
  encodePowerShellCommand,
  parseAutostartArgs,
  parseWindowsInstallationManifest,
  parseWindowsTaskStatus,
  windowsAutostartPaths
} from "./autostart-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const agentPath = path.join(repoRoot, "apps", "agent", "dist", "index.js");
const windowsHostSourcePath = path.join(scriptDir, "windows-autostart-host.cs");

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

async function regularFileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function requireRegularFile(filePath, label) {
  if (!await regularFileExists(filePath)) {
    throw new Error(`${label} does not exist or is not a regular file: ${filePath}`);
  }
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
  const info = await stat(envFile);
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

const WINDOWS_FILE_RETRY_CODES = new Set(["EBUSY", "EACCES", "EPERM"]);

async function renameWithRetry(source, destination, attempts = 20) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      const retryable = process.platform === "win32" &&
        WINDOWS_FILE_RETRY_CODES.has(error?.code) &&
        attempt < attempts;
      if (!retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

async function moveIfPresent(source, destination) {
  if (!await regularFileExists(source)) return false;
  await renameWithRetry(source, destination);
  return true;
}

async function restoreBackup(backup, target, present) {
  await rm(target, { force: true }).catch(() => undefined);
  if (present && await regularFileExists(backup)) {
    await renameWithRetry(backup, target);
  }
}

function compileWindowsHost(powershellPath, sourcePath, outputPath) {
  const command = buildWindowsHostCompilePowerShellCommand({
    sourcePath,
    outputPath
  });
  run(powershellPath, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodePowerShellCommand(command)
  ]);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function printNetworkStatus(configPath) {
  try {
    const config = await loadConfig(configPath);
    const mode = config.server.exposure.mode;
    console.log("network:");
    console.log(`  exposure: ${mode}`);
    console.log(`  listen: ${serverBindHost(config)}:${config.server.port}`);
    if (mode === "local") {
      console.log(`  browserUrl: ${localAgentUrl(config)}`);
      console.log("  lanAccess: disabled (local exposure)");
      return;
    }

    if (mode === "lan") {
      const urls = lanAgentUrls(config);
      console.log(`  browserUrl: ${localAgentUrl(config)}`);
      console.log("  lanAccess: enabled (authenticated, unencrypted private/overlay HTTP)");
      console.log("  sourceAddressGate: private/overlay clients only");
      if (urls.length === 0) {
        console.log("  lanUrls: none detected");
      } else {
        console.log("  lanUrls:");
        for (const url of urls) console.log(`    - ${url}`);
      }
      if (process.platform === "win32") {
        console.log("  firewall: keep the Agent port scoped to trusted Windows Private networks");
      }
      return;
    }

    if (mode === "reverseProxy") {
      console.log(`  upstreamUrl: ${localAgentUrl(config)}`);
    }
    console.log("  browserOrigins:");
    for (const origin of exposureOrigins(config)) console.log(`    - ${origin}`);
  } catch (error) {
    console.log(`network: unavailable (${error instanceof Error ? error.message : error})`);
  }
}

async function installWindows(inputs) {
  const userSid = currentWindowsSid();
  const powershellPath = defaultWindowsPowerShellPath();
  const paths = windowsAutostartPaths();
  const installId = randomUUID();
  const tempHost = path.join(paths.directory, `host-${installId}.tmp.exe`);
  const tempInstallation = path.join(paths.directory, `installation-${installId}.tmp.json`);
  const tempTaskXml = path.join(os.tmpdir(), `palmtty-task-${installId}.xml`);
  const backupHost = path.join(paths.directory, `host-${installId}.bak.exe`);
  const backupInstallation = path.join(paths.directory, `installation-${installId}.bak.json`);

  await requireRegularFile(powershellPath, "Windows PowerShell");
  await requireRegularFile(windowsHostSourcePath, "Windows autostart host source");
  await mkdir(paths.directory, { recursive: true });

  compileWindowsHost(powershellPath, windowsHostSourcePath, tempHost);
  await requireRegularFile(tempHost, "Compiled Windows autostart host");

  const installation = buildWindowsInstallationManifest({
    nodePath: process.execPath,
    agentPath,
    repoRoot,
    configPath: inputs.configPath,
    envFile: inputs.envFile
  });
  await writeFile(tempInstallation, `${JSON.stringify(installation, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });

  const xml = buildWindowsTaskXml({
    userSid,
    hostPath: paths.host,
    installationPath: paths.installation,
    workingDirectory: paths.directory
  });
  await writeFile(tempTaskXml, `\ufeff${xml}`, { encoding: "utf16le", mode: 0o600 });

  let previousHost = false;
  let previousInstallation = false;
  let replacedFiles = false;
  try {
    run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], { acceptedExitCodes: [0, 1] });

    previousHost = await moveIfPresent(paths.host, backupHost);
    previousInstallation = await moveIfPresent(paths.installation, backupInstallation);
    await renameWithRetry(tempHost, paths.host);
    await renameWithRetry(tempInstallation, paths.installation);
    replacedFiles = true;

    run("schtasks.exe", ["/Create", "/TN", WINDOWS_TASK_NAME, "/XML", tempTaskXml, "/F"]);
    await rm(paths.lastError, { force: true });
    await rm(paths.runtime, { force: true });
    run("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);

    await rm(backupHost, { force: true });
    await rm(backupInstallation, { force: true });
  } catch (error) {
    runRollback("end failed installation", "schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], {
      acceptedExitCodes: [0, 1]
    });
    if (replacedFiles) {
      await restoreBackup(backupHost, paths.host, previousHost).catch((rollbackError) => {
        warnRollbackFailure("restore Windows host", rollbackError);
      });
      await restoreBackup(backupInstallation, paths.installation, previousInstallation).catch((rollbackError) => {
        warnRollbackFailure("restore installation manifest", rollbackError);
      });
      if (previousHost && previousInstallation) {
        runRollback("restart previous Windows task", "schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME], {
          acceptedExitCodes: [0, 1]
        });
      } else {
        runRollback("remove incomplete Windows task", "schtasks.exe", ["/Delete", "/TN", WINDOWS_TASK_NAME, "/F"], {
          acceptedExitCodes: [0, 1]
        });
      }
    }
    throw error;
  } finally {
    for (const temporary of [
      tempHost,
      tempInstallation,
      tempTaskXml,
      backupHost,
      backupInstallation
    ]) {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  console.log(`[PalmTTY] installed Windows console-free sign-in task: ${WINDOWS_TASK_NAME}`);
  console.log(`[PalmTTY] launcher: ${paths.host}`);
  console.log(`[PalmTTY] config: ${inputs.configPath}`);
  if (inputs.envFile) console.log(`[PalmTTY] environment file: ${inputs.envFile}`);
  await printNetworkStatus(inputs.configPath);
}

function queryWindowsTaskStatus() {
  const command = buildWindowsTaskStatusPowerShellCommand();
  const result = run(defaultWindowsPowerShellPath(), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodePowerShellCommand(command)
  ]);
  return parseWindowsTaskStatus(result.stdout);
}

async function readWindowsRuntime(paths) {
  try {
    const source = await readFile(paths.runtime, "utf8");
    const value = JSON.parse(source);
    if (
      !value ||
      typeof value !== "object" ||
      !Number.isInteger(value.hostPid) ||
      !Number.isInteger(value.agentPid)
    ) {
      return undefined;
    }
    return {
      hostPid: value.hostPid,
      agentPid: value.agentPid,
      startedAtUtc: typeof value.startedAtUtc === "string" ? value.startedAtUtc : undefined
    };
  } catch {
    return undefined;
  }
}

async function statusWindows() {
  const status = queryWindowsTaskStatus();
  const paths = windowsAutostartPaths();
  console.log("[PalmTTY] autostart status");
  console.log("platform: windows");
  console.log(`task: ${WINDOWS_TASK_NAME}`);
  console.log(`installed: ${status.installed ? "yes" : "no"}`);
  if (!status.installed) return;

  console.log(`state: ${status.state}`);
  console.log(`lastTaskResult: ${status.lastTaskResult}`);
  console.log(`launcher: ${await regularFileExists(paths.host) ? "native-gui" : "missing"}`);
  console.log(`launcherPath: ${paths.host}`);
  if (status.lastRunTime) console.log(`lastRunTime: ${status.lastRunTime}`);
  if (status.nextRunTime) console.log(`nextRunTime: ${status.nextRunTime}`);

  let installation;
  try {
    installation = parseWindowsInstallationManifest(
      await readFile(paths.installation, "utf8")
    );
    console.log(`config: ${installation.configPath}`);
  } catch (error) {
    console.log(`installation: invalid (${error instanceof Error ? error.message : error})`);
  }

  const runtime = await readWindowsRuntime(paths);
  if (runtime) {
    console.log(`hostPid: ${runtime.hostPid} (${processIsAlive(runtime.hostPid) ? "alive" : "stale"})`);
    console.log(`agentPid: ${runtime.agentPid} (${processIsAlive(runtime.agentPid) ? "alive" : "stale"})`);
    if (runtime.startedAtUtc) console.log(`startedAt: ${runtime.startedAtUtc}`);
  } else {
    console.log("runtime: unavailable");
  }

  if (await regularFileExists(paths.lastError)) {
    const firstLine = (await readFile(paths.lastError, "utf8")).split(/\r?\n/u)[0];
    console.log(`lastError: ${firstLine || "present"} (${paths.lastError})`);
  }

  if (installation) await printNetworkStatus(installation.configPath);
}

function restartWindows() {
  run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], { acceptedExitCodes: [0, 1] });
  run("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
  console.log(`[PalmTTY] restarted Windows sign-in task: ${WINDOWS_TASK_NAME}`);
}

async function uninstallWindows() {
  const paths = windowsAutostartPaths();
  run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], { acceptedExitCodes: [0, 1] });
  run("schtasks.exe", ["/Delete", "/TN", WINDOWS_TASK_NAME, "/F"], { acceptedExitCodes: [0, 1] });
  await rm(paths.directory, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100
  });
  console.log(`[PalmTTY] removed Windows sign-in task and launcher state: ${paths.directory}`);
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
  await printNetworkStatus(inputs.configPath);
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
    if (process.platform === "win32") await statusWindows();
    else statusLinux();
    return;
  }

  if (options.command === "restart") {
    if (process.platform === "win32") restartWindows();
    else restartLinux();
    return;
  }

  if (options.command === "uninstall") {
    if (process.platform === "win32") await uninstallWindows();
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
