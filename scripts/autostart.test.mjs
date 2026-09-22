import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSystemdUserUnit,
  buildWindowsTaskStatusPowerShellCommand,
  buildWindowsTaskXml,
  defaultConfigPath,
  defaultWindowsPowerShellPath,
  encodePowerShellCommand,
  parseAutostartArgs,
  parseWindowsTaskStatus,
  quoteWindowsArg
} from "./autostart-core.mjs";

const windowsSupervisorPath = fileURLToPath(new URL("./windows-autostart-supervisor.ps1", import.meta.url));

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

test("defaultConfigPath follows Windows and XDG conventions", () => {
  assert.equal(
    defaultConfigPath("win32", { APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "C:\\Users\\u"),
    "C:\\Users\\u\\AppData\\Roaming\\PalmTTY\\config.yaml"
  );
  assert.equal(defaultConfigPath("linux", { XDG_CONFIG_HOME: "/tmp/config" }, "/home/u"), "/tmp/config/palmtty/config.yaml");
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

test("Windows supervisor is a kill-on-close job with detached-child breakaway", () => {
  const source = readFileSync(windowsSupervisorPath, "utf8");
  assert.match(source, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/u);
  assert.match(source, /JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK/u);
  assert.match(source, /CREATE_SUSPENDED \| CREATE_NO_WINDOW/u);
  assert.match(source, /AssignProcessToJobObject/u);
  assert.match(source, /WaitForSingleObject/u);
  assert.match(source, /param\(/u);
  assert.match(source, /\[string\]\$NodePath/u);
  assert.match(source, /\[string\]\$AgentPath/u);
  assert.match(source, /\[string\]\$RepoRoot/u);
  assert.match(source, /\[string\]\$ConfigPath/u);
});

test("Windows supervisor compiles, propagates Agent exit code, and lets detached children break away", { skip: process.platform !== "win32" }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "palmtty autostart-"));
  const markerPath = path.join(directory, "worker-survived.txt");
  const workerPath = path.join(directory, "worker.cjs");
  const agentPath = path.join(directory, "agent.cjs");
  try {
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

    const result = spawnSync(
      defaultWindowsPowerShellPath(),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-File",
        windowsSupervisorPath,
        "-NodePath",
        process.execPath,
        "-AgentPath",
        agentPath,
        "-RepoRoot",
        directory,
        "-ConfigPath",
        path.join(directory, "ignored.yaml")
      ],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 }
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
    assert.fail("detached child did not survive supervisor job close");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Windows task runs headlessly as the current interactive user without elevation", () => {
  const xml = buildWindowsTaskXml({
    userSid: "S-1-5-21-123",
    powershellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    supervisorPath: "C:\\PalmTTY\\scripts\\windows-autostart-supervisor.ps1",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    agentPath: "C:\\PalmTTY\\apps\\agent\\dist\\index.js",
    repoRoot: "C:\\PalmTTY",
    configPath: "C:\\Users\\me\\PalmTTY config.yaml",
    envFile: "C:\\Users\\me\\PalmTTY.env"
  });
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/u);
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/u);
  assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/u);
  assert.match(xml, /<Command>C:\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe<\/Command>/u);
  assert.match(xml, /-WindowStyle Hidden/u);
  assert.match(xml, /-File/u);
  assert.match(xml, /windows-autostart-supervisor\.ps1/u);
  assert.match(xml, /-EnvFile/u);
  assert.match(xml, /PalmTTY config\.yaml/u);
  assert.doesNotMatch(xml, /<Command>C:\\Program Files\\nodejs\\node\.exe<\/Command>/u);
  assert.doesNotMatch(xml, /PALMTTY_ACCESS_TOKEN=/u);
  assert.throws(
    () => buildWindowsTaskXml({
      userSid: "S-1-5-21-123",
      powershellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      supervisorPath: "C:\\PalmTTY\\scripts\\windows-autostart-supervisor.ps1",
      nodePath: "C:\\Node\\node.exe",
      agentPath: "C:\\PalmTTY\\agent.js",
      repoRoot: "C:\\PalmTTY\nmalformed",
      configPath: "C:\\PalmTTY\\config.yaml"
    }),
    /single line/u
  );
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
    parseWindowsTaskStatus('{"installed":true,"state":"Running","lastRunTime":"2026-09-22T12:00:00.0000000Z","nextRunTime":null}'),
    {
      installed: true,
      state: "running",
      lastRunTime: "2026-09-22T12:00:00.0000000Z",
      nextRunTime: null
    }
  );
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
