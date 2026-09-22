import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WINDOWS_TASK_NAME,
  buildSystemdUserUnit,
  buildWindowsInstallationManifest,
  buildWindowsTaskStatusPowerShellCommand,
  buildWindowsTaskXml,
  defaultLinuxUnitPath,
  defaultWindowsPowerShellPath,
  encodePowerShellCommand,
  parseWindowsTaskStatus,
  windowsAutostartPaths
} from "./autostart-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const installRoot = path.resolve(
  process.env.PALMTTY_INSTALL_ROOT || path.join(scriptDir, "..")
);
const manifestPath = path.join(installRoot, "release-manifest.json");
const nodePath = path.join(
  installRoot,
  "runtime",
  process.platform === "win32" ? "node.exe" : "node"
);
const agentPath = path.join(installRoot, "app", "dist", "index.js");
const windowsHostPath = path.join(
  installRoot,
  "bin",
  "palmtty-autostart-host.exe"
);
const defaultConfigTemplate = path.join(
  installRoot,
  "defaults",
  "config.yaml"
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? installRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) throw result.error;
  const accepted = options.acceptedExitCodes ?? [0];
  if (!accepted.includes(result.status ?? -1)) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result;
}

function defaultPaths() {
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? os.homedir();
    const directory = path.join(base, "PalmTTY");
    return {
      directory,
      config: path.join(directory, "config.yaml"),
      envFile: path.join(directory, "credentials.env")
    };
  }
  if (process.platform === "darwin") {
    const directory = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "PalmTTY"
    );
    return {
      directory,
      config: path.join(directory, "config.yaml"),
      envFile: path.join(directory, "credentials.env")
    };
  }
  const directory = path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    "palmtty"
  );
  return {
    directory,
    config: path.join(directory, "config.yaml"),
    envFile: path.join(directory, "credentials.env")
  };
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  if (args.indexOf(name, index + 1) >= 0) {
    throw new Error(`${name} may be specified only once`);
  }
  return path.resolve(value);
}

function removeOptions(args, names) {
  const next = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (names.includes(value)) {
      index += 1;
      continue;
    }
    next.push(value);
  }
  return next;
}

async function requireFile(filePath, label) {
  const info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`${label} is missing: ${filePath}`);
}

async function ensurePrivateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(directory, 0o700);
}

async function ensurePrivateEnvFile(envFile) {
  await requireFile(envFile, "PalmTTY credentials file");
  if (process.platform === "win32") return;
  const mode = (await stat(envFile)).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `PalmTTY credentials file must not be group/world accessible: ${envFile}`
    );
  }
}

async function readAccessToken(envFile) {
  const source = await readFile(envFile, "utf8");
  const line = source
    .split(/\r?\n/u)
    .find((value) => value.startsWith("PALMTTY_ACCESS_TOKEN="));
  if (!line) return undefined;
  return line.slice("PALMTTY_ACCESS_TOKEN=".length).trim();
}

async function initialize({ installService = false, quiet = false } = {}) {
  const paths = defaultPaths();
  await ensurePrivateDirectory(paths.directory);
  await requireFile(defaultConfigTemplate, "PalmTTY default config");

  const configExists = await stat(paths.config).then(
    (value) => value.isFile(),
    () => false
  );
  if (!configExists) {
    await copyFile(defaultConfigTemplate, paths.config);
  }

  const envExists = await stat(paths.envFile).then(
    (value) => value.isFile(),
    () => false
  );
  if (!envExists) {
    const token = randomBytes(32).toString("base64url");
    await writeFile(
      paths.envFile,
      `PALMTTY_ACCESS_TOKEN=${token}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" }
    );
  }
  if (process.platform !== "win32") await chmod(paths.envFile, 0o600);

  if (installService) {
    await installServiceEntry(paths.config, paths.envFile);
  }

  if (!quiet) await printInfo(paths.config, paths.envFile);
  return paths;
}

async function printInfo(configPath = defaultPaths().config, envFile = defaultPaths().envFile) {
  const release = JSON.parse(await readFile(manifestPath, "utf8"));
  const token = await readAccessToken(envFile).catch(() => undefined);
  console.log(`PalmTTY ${release.version}`);
  console.log(`config: ${configPath}`);
  console.log(`credentials: ${envFile}`);
  console.log("browser: http://127.0.0.1:17688/");
  if (token) {
    console.log("");
    console.log("Access token:");
    console.log(token);
  } else {
    console.log("access token: unavailable");
  }
}

function currentWindowsSid() {
  const powershell = defaultWindowsPowerShellPath();
  const command =
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); " +
    "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value";
  const result = run(powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodePowerShellCommand(command)
  ]);
  const sid = result.stdout.trim();
  if (!/^S-\d-(?:\d+-)+\d+$/u.test(sid)) {
    throw new Error("Unable to resolve current Windows user SID");
  }
  return sid;
}

async function writeWindowsTaskXml(filePath, xml) {
  await writeFile(filePath, `\ufeff${xml}`, {
    encoding: "utf16le",
    mode: 0o600
  });
}

async function installWindows(configPath, envFile) {
  await requireFile(windowsHostPath, "PalmTTY Windows service host");
  const paths = windowsAutostartPaths();
  await ensurePrivateDirectory(paths.directory);

  const installation = buildWindowsInstallationManifest({
    nodePath,
    agentPath,
    repoRoot: installRoot,
    configPath,
    envFile
  });
  const previousManifest = await readFile(paths.installation, "utf8").catch(
    () => undefined
  );
  const tempManifest = path.join(
    paths.directory,
    `installation-${randomUUID()}.tmp.json`
  );
  const tempXml = path.join(os.tmpdir(), `palmtty-task-${randomUUID()}.xml`);

  await writeFile(tempManifest, `${JSON.stringify(installation, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  const xml = buildWindowsTaskXml({
    userSid: currentWindowsSid(),
    hostPath: windowsHostPath,
    installationPath: paths.installation,
    workingDirectory: installRoot
  });
  await writeWindowsTaskXml(tempXml, xml);

  run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], {
    acceptedExitCodes: [0, 1]
  });

  try {
    await rm(paths.installation, { force: true });
    await copyFile(tempManifest, paths.installation);
    run("schtasks.exe", [
      "/Create",
      "/TN",
      WINDOWS_TASK_NAME,
      "/XML",
      tempXml,
      "/F"
    ]);
    await rm(paths.lastError, { force: true });
    await rm(paths.runtime, { force: true });
    run("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
  } catch (error) {
    if (previousManifest !== undefined) {
      await writeFile(paths.installation, previousManifest, {
        encoding: "utf8",
        mode: 0o600
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    await rm(tempManifest, { force: true }).catch(() => undefined);
    await rm(tempXml, { force: true }).catch(() => undefined);
  }

  console.log(`[PalmTTY] installed current-user startup task: ${WINDOWS_TASK_NAME}`);
}

async function installLinux(configPath, envFile) {
  await ensurePrivateEnvFile(envFile);
  const unitPath = defaultLinuxUnitPath();
  await mkdir(path.dirname(unitPath), { recursive: true });
  const unit = buildSystemdUserUnit({
    nodePath,
    agentPath,
    repoRoot: installRoot,
    configPath,
    envFile
  });
  await writeFile(unitPath, unit, { encoding: "utf8", mode: 0o644 });
  run("systemctl", ["--user", "daemon-reload"]);
  run("systemctl", ["--user", "enable", "palmtty.service"]);
  run("systemctl", ["--user", "restart", "palmtty.service"]);
  console.log(`[PalmTTY] installed systemd user service: ${unitPath}`);
}

async function installServiceEntry(configPath, envFile) {
  await requireFile(nodePath, "Bundled Node runtime");
  await requireFile(agentPath, "PalmTTY Agent");
  await requireFile(configPath, "PalmTTY config");
  await ensurePrivateEnvFile(envFile);
  if (process.platform === "win32") return installWindows(configPath, envFile);
  if (process.platform === "linux") return installLinux(configPath, envFile);
  throw new Error(
    `Installed service management is supported on Windows and Linux; current platform is ${process.platform}`
  );
}

async function serviceStatus() {
  if (process.platform === "win32") {
    const powershell = defaultWindowsPowerShellPath();
    const command = buildWindowsTaskStatusPowerShellCommand();
    const result = run(powershell, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodePowerShellCommand(command)
    ]);
    const status = parseWindowsTaskStatus(result.stdout);
    console.log("[PalmTTY] service status");
    console.log("platform: windows");
    console.log(`installed: ${status.installed ? "yes" : "no"}`);
    if (!status.installed) return;
    console.log(`state: ${status.state}`);
    console.log(`lastTaskResult: ${status.lastTaskResult}`);
    const paths = windowsAutostartPaths();
    const runtime = await readFile(paths.runtime, "utf8")
      .then((source) => JSON.parse(source))
      .catch(() => undefined);
    if (runtime?.agentPid) console.log(`agentPid: ${runtime.agentPid}`);
    if (runtime?.startedAtUtc) console.log(`startedAt: ${runtime.startedAtUtc}`);
    if (await stat(paths.lastError).then(() => true, () => false)) {
      console.log(`lastError: ${paths.lastError}`);
    }
    return;
  }
  if (process.platform === "linux") {
    const enabled = run(
      "systemctl",
      ["--user", "is-enabled", "palmtty.service"],
      { acceptedExitCodes: [0, 1, 3, 4] }
    ).stdout.trim();
    const active = run(
      "systemctl",
      ["--user", "is-active", "palmtty.service"],
      { acceptedExitCodes: [0, 1, 3, 4] }
    ).stdout.trim();
    console.log(
      `[PalmTTY] palmtty.service: enabled=${enabled || "unknown"}, active=${active || "unknown"}`
    );
    return;
  }
  throw new Error("Service status is supported on Windows and Linux");
}

async function serviceRestart() {
  if (process.platform === "win32") {
    run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], {
      acceptedExitCodes: [0, 1]
    });
    run("schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]);
    console.log(`[PalmTTY] restarted ${WINDOWS_TASK_NAME}`);
    return;
  }
  if (process.platform === "linux") {
    run("systemctl", ["--user", "restart", "palmtty.service"]);
    console.log("[PalmTTY] restarted palmtty.service");
    return;
  }
  throw new Error("Service restart is supported on Windows and Linux");
}

async function serviceUninstall() {
  if (process.platform === "win32") {
    const paths = windowsAutostartPaths();
    run("schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME], {
      acceptedExitCodes: [0, 1]
    });
    run("schtasks.exe", ["/Delete", "/TN", WINDOWS_TASK_NAME, "/F"], {
      acceptedExitCodes: [0, 1]
    });
    await Promise.all([
      rm(paths.installation, { force: true }),
      rm(paths.runtime, { force: true }),
      rm(paths.lastError, { force: true })
    ]);
    console.log(`[PalmTTY] removed ${WINDOWS_TASK_NAME}`);
    return;
  }
  if (process.platform === "linux") {
    run(
      "systemctl",
      ["--user", "disable", "--now", "palmtty.service"],
      { acceptedExitCodes: [0, 1, 4, 5] }
    );
    await rm(defaultLinuxUnitPath(), { force: true });
    run("systemctl", ["--user", "daemon-reload"]);
    console.log("[PalmTTY] removed palmtty.service");
    return;
  }
  throw new Error("Service uninstall is supported on Windows and Linux");
}

function withDefaultAgentFiles(args) {
  const defaults = defaultPaths();
  const config = optionValue(args, "--config") ?? defaults.config;
  const envFile = optionValue(args, "--env-file") ?? defaults.envFile;
  const stripped = removeOptions(args, ["--config", "--env-file"]);
  return [
    ...stripped,
    "--config",
    config,
    "--env-file",
    envFile
  ];
}

async function runAgent(args) {
  await requireFile(nodePath, "Bundled Node runtime");
  await requireFile(agentPath, "PalmTTY Agent");
  const child = spawn(nodePath, [agentPath, ...withDefaultAgentFiles(args)], {
    cwd: installRoot,
    env: {
      ...process.env,
      PALMTTY_INSTALL_ROOT: installRoot
    },
    stdio: "inherit",
    windowsHide: true
  });

  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", forward);
  process.once("SIGTERM", forward);

  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      if (signal) {
        reject(new Error(`PalmTTY Agent exited from signal ${signal}`));
      } else {
        resolve(exitCode ?? 1);
      }
    });
  }).finally(() => {
    process.removeListener("SIGINT", forward);
    process.removeListener("SIGTERM", forward);
  });
  process.exitCode = code;
}

function usage() {
  console.log(`PalmTTY installed CLI

Usage:
  palmtty init [--install-service] [--quiet]
  palmtty info
  palmtty start [--config <path>] [--env-file <path>]
  palmtty preflight [--config <path>] [--env-file <path>]
  palmtty service install [--config <path>] [--env-file <path>]
  palmtty service status
  palmtty service restart
  palmtty service uninstall
  palmtty version
`);
}

async function main() {
  await requireFile(manifestPath, "PalmTTY release manifest");
  const [command = "help", ...args] = process.argv.slice(2);

  if (command === "version" || command === "--version" || command === "-v") {
    const release = JSON.parse(await readFile(manifestPath, "utf8"));
    console.log(release.version);
    return;
  }
  if (command === "init") {
    const known = new Set(["--install-service", "--quiet"]);
    for (const arg of args) {
      if (!known.has(arg)) throw new Error(`Unknown init option: ${arg}`);
    }
    await initialize({
      installService: args.includes("--install-service"),
      quiet: args.includes("--quiet")
    });
    return;
  }
  if (command === "info") {
    await printInfo();
    return;
  }
  if (command === "start") {
    await runAgent(args);
    return;
  }
  if (command === "preflight") {
    await runAgent(["--preflight", ...args]);
    return;
  }
  if (command === "service") {
    const [action, ...serviceArgs] = args;
    if (action === "install") {
      const defaults = defaultPaths();
      const config = optionValue(serviceArgs, "--config") ?? defaults.config;
      const envFile = optionValue(serviceArgs, "--env-file") ?? defaults.envFile;
      const rest = removeOptions(serviceArgs, ["--config", "--env-file"]);
      if (rest.length > 0) {
        throw new Error(`Unknown service install option: ${rest[0]}`);
      }
      await installServiceEntry(config, envFile);
      return;
    }
    if (serviceArgs.length > 0) {
      throw new Error(`service ${action ?? ""} does not accept additional options`);
    }
    if (action === "status") return serviceStatus();
    if (action === "restart") return serviceRestart();
    if (action === "uninstall") return serviceUninstall();
    throw new Error(
      "Usage: palmtty service <install|status|restart|uninstall>"
    );
  }

  usage();
  if (command !== "help" && command !== "--help" && command !== "-h") {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(
    `[PalmTTY] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
