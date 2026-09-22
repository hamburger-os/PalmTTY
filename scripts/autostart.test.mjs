import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSystemdUserUnit,
  buildWindowsAgentPowerShellCommand,
  buildWindowsTaskStatusPowerShellCommand,
  buildWindowsTaskXml,
  defaultConfigPath,
  defaultWindowsPowerShellPath,
  encodePowerShellCommand,
  parseAutostartArgs,
  parseWindowsTaskStatus,
  quoteWindowsArg
} from "./autostart-core.mjs";

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

test("Windows launcher uses a hidden PowerShell host and preserves process exit status", () => {
  const command = buildWindowsAgentPowerShellCommand({
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    agentPath: "C:\\PalmTTY\\apps\\agent\\dist\\index.js",
    configPath: "C:\\Users\\O'Brien\\PalmTTY config.yaml",
    envFile: "C:\\Users\\me\\PalmTTY.env"
  });
  assert.equal(command.includes("& 'C:\\Program Files\\nodejs\\node.exe'"), true);
  assert.match(command, /O''Brien/u);
  assert.match(command, /--config/u);
  assert.match(command, /--env-file/u);
  assert.match(command, /exit \$LASTEXITCODE/u);
  assert.equal(Buffer.from(encodePowerShellCommand(command), "base64").toString("utf16le"), command);
});

test("Windows task runs headlessly as the current interactive user without elevation", () => {
  const xml = buildWindowsTaskXml({
    userSid: "S-1-5-21-123",
    powershellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
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
  assert.match(xml, /-EncodedCommand/u);
  assert.doesNotMatch(xml, /<Command>C:\\Program Files\\nodejs\\node\.exe<\/Command>/u);
  assert.doesNotMatch(xml, /PALMTTY_ACCESS_TOKEN=/u);
  assert.throws(
    () => buildWindowsTaskXml({
      userSid: "S-1-5-21-123",
      powershellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
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
