import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSystemdUserUnit,
  buildWindowsHostCompilePowerShellCommand,
  buildWindowsInstallationManifest,
  buildWindowsTaskStatusPowerShellCommand,
  buildWindowsTaskXml,
  defaultConfigPath,
  defaultWindowsPowerShellPath,
  encodePowerShellCommand,
  parseAutostartArgs,
  parseWindowsInstallationManifest,
  parseWindowsTaskStatus,
  quoteWindowsArg,
  windowsAutostartPaths
} from "./autostart-core.mjs";

const windowsHostSourcePath = fileURLToPath(new URL("./windows-autostart-host.cs", import.meta.url));

test("parseAutostartArgs accepts install options and resolves paths", () => {
  const result = parseAutostartArgs(["install", "--config", "./config.yaml", "--env-file", "./secrets.env"]);
  assert.equal(result.command, "install");
  assert.equal(result.configPath.endsWith("config.yaml"), true);
  assert.equal(result.envFile.endsWith("secrets.env"), true);
});

test("parseAutostartArgs rejects duplicate and unknown options", () => {
  assert.throws(() => parseAutostartArgs(["install", "--config", "a", "--config", "b"]), /only once/u);
  assert.throws(() => parseAutostartArgs(["install", "--wat"]), /Unknown/u);
  assert.throws(() => parseAutostartArgs(["status", "--config", "a"]), /does not accept/u);
  assert.throws(() => parseAutostartArgs(["restart", "--env-file", "a"]), /does not accept/u);
});

test("default paths follow Windows and XDG conventions", () => {
  assert.equal(
    defaultConfigPath("win32", { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "C:\\Users\\u"),
    "C:\\Users\\u\\AppData\\Roaming\\PalmTTY\\config.yaml"
  );
  assert.equal(defaultConfigPath("linux", { XDG_CONFIG_HOME: "/tmp/config" }, "/home/u"), "/tmp/config/palmtty/config.yaml");

  assert.deepEqual(
    windowsAutostartPaths({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "C:\\Users\\u"),
    {
      directory: "C:\\Users\\u\\AppData\\Local\\PalmTTY\\autostart",
      host: "C:\\Users\\u\\AppData\\Local\\PalmTTY\\autostart\\palmtty-autostart-host.exe",
      installation: "C:\\Users\\u\\AppData\\Local\\PalmTTY\\autostart\\installation.json",
      runtime: "C:\\Users\\u\\AppData\\Local\\PalmTTY\\autostart\\runtime.json",
      lastError: "C:\\Users\\u\\AppData\\Local\\PalmTTY\\autostart\\last-error.txt"
    }
  );
});

test("defaultWindowsPowerShellPath resolves the system Windows PowerShell", () => {
  assert.equal(
    defaultWindowsPowerShellPath({ SystemRoot: "C:\\Windows" }),
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
  );
  assert.throws(() => defaultWindowsPowerShellPath({}), /SystemRoot/u);
});

test("quoteWindowsArg preserves spaces and trailing backslashes", () => {
  assert.equal(quoteWindowsArg("plain"), "plain");
  assert.equal(quoteWindowsArg("C:\\Program Files\\node.exe"), '"C:\\Program Files\\node.exe"');
  assert.equal(quoteWindowsArg("C:\\path with space\\"), '"C:\\path with space\\\\"');
});

test("Windows installation manifest contains paths but never secret values", () => {
  const manifest = buildWindowsInstallationManifest({
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    agentPath: "C:\\PalmTTY\\apps\\agent\\dist\\index.js",
    repoRoot: "C:\\PalmTTY",
    configPath: "C:\\Users\\me\\PalmTTY config.yaml",
    envFile: "C:\\Users\\me\\PalmTTY\\autostart.env"
  });
  assert.equal(manifest.version, 1);
  assert.equal(manifest.envFile, "C:\\Users\\me\\PalmTTY\\autostart.env");
  assert.doesNotMatch(JSON.stringify(manifest), /PALMTTY_ACCESS_TOKEN=/u);
  assert.deepEqual(
    parseWindowsInstallationManifest(JSON.stringify(manifest)),
    manifest
  );
  assert.throws(
    () => parseWindowsInstallationManifest('{"version":2}'),
    /unsupported version/u
  );
});

test("Windows Task Scheduler launches only the native GUI host", () => {
  const xml = buildWindowsTaskXml({
    userSid: "S-1-5-21-123",
    hostPath: "C:\\Users\\me\\AppData\\Local\\PalmTTY\\autostart\\palmtty-autostart-host.exe",
    installationPath: "C:\\Users\\me\\AppData\\Local\\PalmTTY\\autostart\\installation.json",
    workingDirectory: "C:\\Users\\me\\AppData\\Local\\PalmTTY\\autostart"
  });
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/u);
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/u);
  assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/u);
  assert.match(xml, /<Command>C:\\Users\\me\\AppData\\Local\\PalmTTY\\autostart\\palmtty-autostart-host\.exe<\/Command>/u);
  assert.match(xml, /--installation/u);
  assert.match(xml, /installation\.json/u);
  assert.doesNotMatch(xml, /powershell/i);
  assert.doesNotMatch(xml, /node\.exe/i);
  assert.doesNotMatch(xml, /apps\\agent/i);
});

test("Windows host source owns Agent lifecycle without a console", () => {
  const source = readFileSync(windowsHostSourcePath, "utf8");
  assert.match(source, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/u);
  assert.match(source, /JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK/u);
  assert.match(source, /CREATE_SUSPENDED \| CREATE_NO_WINDOW/u);
  assert.match(source, /AssignProcessToJobObject/u);
  assert.match(source, /WaitForSingleObject/u);
  assert.match(source, /DataContractJsonSerializer/u);
  assert.doesNotMatch(source, /System\.Windows\.Forms/u);
});

test("Windows host compilation targets the GUI subsystem", () => {
  const command = buildWindowsHostCompilePowerShellCommand({
    sourcePath: "C:\\PalmTTY\\scripts\\windows-autostart-host.cs",
    outputPath: "C:\\Users\\me\\AppData\\Local\\PalmTTY\\autostart\\host.tmp.exe"
  });
  assert.match(command, /Add-Type/u);
  assert.match(command, /-OutputType WindowsApplication/u);
  assert.match(command, /System\.Runtime\.Serialization\.dll/u);
});

function peSubsystem(executablePath) {
  const data = readFileSync(executablePath);
  const peOffset = data.readUInt32LE(0x3c);
  assert.equal(data.toString("ascii", peOffset, peOffset + 4), "PE\0\0");
  const optionalHeader = peOffset + 4 + 20;
  const magic = data.readUInt16LE(optionalHeader);
  assert.ok(magic === 0x10b || magic === 0x20b, "PE optional-header magic must be PE32/PE32+");
  return data.readUInt16LE(optionalHeader + 68);
}

test("Windows native host compiles as GUI, propagates Agent exit, and preserves detached Worker lifetime", { skip: process.platform !== "win32" }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "palmtty autostart-"));
  const hostPath = path.join(directory, "palmtty-autostart-host.exe");
  const installationPath = path.join(directory, "installation.json");
  const markerPath = path.join(directory, "worker-survived.txt");
  const workerPath = path.join(directory, "worker.cjs");
  const agentPath = path.join(directory, "agent.cjs");
  const configPath = path.join(directory, "config.yaml");

  try {
    writeFileSync(configPath, "server:\n  port: 17688\n  exposure:\n    mode: local\n", "utf8");
    writeFileSync(
      workerPath,
      `const { writeFileSync } = require("node:fs");\nsetTimeout(() => { writeFileSync(${JSON.stringify(markerPath)}, "ok"); }, 300);\n`,
      "utf8"
    );
    writeFileSync(
      agentPath,
      `const { spawn } = require("node:child_process");\nconst child = spawn(process.execPath, [${JSON.stringify(workerPath)}], { detached: true, windowsHide: true, stdio: "ignore" });\nchild.unref();\nprocess.exit(7);\n`,
      "utf8"
    );

    const compileCommand = buildWindowsHostCompilePowerShellCommand({
      sourcePath: windowsHostSourcePath,
      outputPath: hostPath
    });
    const compile = spawnSync(
      defaultWindowsPowerShellPath(),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodePowerShellCommand(compileCommand)
      ],
      { encoding: "utf8", windowsHide: true, timeout: 30_000 }
    );
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    assert.equal(peSubsystem(hostPath), 2, "PE subsystem must be Windows GUI");

    writeFileSync(
      installationPath,
      JSON.stringify(buildWindowsInstallationManifest({
        nodePath: process.execPath,
        agentPath,
        repoRoot: directory,
        configPath
      })),
      "utf8"
    );

    const result = spawnSync(
      hostPath,
      ["--installation", installationPath],
      { encoding: "utf8", windowsHide: false, timeout: 15_000 }
    );
    assert.equal(result.status, 7, result.stderr || result.stdout);

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        assert.equal(readFileSync(markerPath, "utf8"), "ok");
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.fail("detached Worker did not survive native host Job close");
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("Windows status query executes through the system PowerShell", { skip: process.platform !== "win32" }, () => {
  const command = buildWindowsTaskStatusPowerShellCommand("PalmTTY status test 9f0dd16d");
  const result = spawnSync(
    defaultWindowsPowerShellPath(),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodePowerShellCommand(command)
    ],
    { encoding: "utf8", windowsHide: true }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(parseWindowsTaskStatus(result.stdout), { installed: false });
});

test("Windows status query is locale-independent UTF-8 JSON", () => {
  const command = buildWindowsTaskStatusPowerShellCommand();
  assert.match(command, /OutputEncoding/u);
  assert.match(command, /Get-ScheduledTask/u);
  assert.match(command, /ConvertTo-Json -Compress/u);
  assert.doesNotMatch(command, /schtasks/u);

  assert.deepEqual(parseWindowsTaskStatus('{"installed":false}'), { installed: false });
  assert.deepEqual(
    parseWindowsTaskStatus('{"installed":true,"state":"Running","lastRunTime":"2026-09-22T12:00:00.0000000Z","nextRunTime":null,"lastTaskResult":0}'),
    {
      installed: true,
      state: "running",
      lastRunTime: "2026-09-22T12:00:00.0000000Z",
      nextRunTime: null,
      lastTaskResult: 0
    }
  );
  assert.throws(() => parseWindowsTaskStatus('{"installed":true,"state":"Running","lastRunTime":null,"nextRunTime":null}'), /lastTaskResult/u);
  assert.throws(() => parseWindowsTaskStatus("garbage"), /invalid status payload/u);
});

test("systemd unit preserves independent Worker lifetime", () => {
  const unit = buildSystemdUserUnit({
    nodePath: "/usr/bin/node",
    agentPath: "/opt/PalmTTY/apps/agent/dist/index.js",
    repoRoot: "/opt/PalmTTY",
    configPath: "/home/me/.config/palmtty/config.yaml",
    envFile: "/home/me/.config/palmtty/autostart.env"
  });
  assert.match(unit, /^KillMode=process$/mu);
  assert.match(unit, /^Restart=on-failure$/mu);
  assert.doesNotMatch(unit, /network-online\.target/u);
  assert.match(unit, /--env-file/u);
  assert.doesNotMatch(unit, /PALMTTY_ACCESS_TOKEN=/u);
});
