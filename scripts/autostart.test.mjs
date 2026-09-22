import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSystemdUserUnit,
  buildWindowsTaskXml,
  defaultConfigPath,
  parseAutostartArgs,
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

test("quoteWindowsArg preserves spaces and trailing backslashes", () => {
  assert.equal(quoteWindowsArg("plain"), "plain");
  assert.equal(quoteWindowsArg("C:\\Program Files\\node.exe"), '"C:\\Program Files\\node.exe"');
  assert.equal(quoteWindowsArg("C:\\path with space\\"), '"C:\\path with space\\\\"');
});

test("Windows task runs as the current interactive user without elevation", () => {
  const xml = buildWindowsTaskXml({
    userSid: "S-1-5-21-123",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    agentPath: "C:\\PalmTTY\\apps\\agent\\dist\\index.js",
    repoRoot: "C:\\PalmTTY",
    configPath: "C:\\Users\\me\\PalmTTY config.yaml",
    envFile: "C:\\Users\\me\\PalmTTY.env"
  });
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/u);
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/u);
  assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/u);
  assert.match(xml, /--env-file/u);
  assert.doesNotMatch(xml, /PALMTTY_ACCESS_TOKEN=/u);
  assert.match(xml, /PalmTTY config\.yaml/u);
  assert.throws(
    () => buildWindowsTaskXml({
      userSid: "S-1-5-21-123",
      nodePath: "C:\\Node\\node.exe",
      agentPath: "C:\\PalmTTY\\agent.js",
      repoRoot: "C:\\PalmTTY\nmalformed",
      configPath: "C:\\PalmTTY\\config.yaml"
    }),
    /single line/u
  );
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
