import os from "node:os";
import path from "node:path";

export const WINDOWS_TASK_NAME = "PalmTTY Agent";
export const LINUX_UNIT_NAME = "palmtty.service";

export function defaultConfigPath(platform = process.platform, env = process.env, home = os.homedir()) {
  const platformPath = platform === "win32" ? path.win32 : path.posix;
  if (platform === "win32") {
    return platformPath.join(env.APPDATA ?? home, "PalmTTY", "config.yaml");
  }
  if (platform === "darwin") {
    return platformPath.join(home, "Library", "Application Support", "PalmTTY", "config.yaml");
  }
  return platformPath.join(env.XDG_CONFIG_HOME ?? platformPath.join(home, ".config"), "palmtty", "config.yaml");
}

export function defaultLinuxUnitPath(env = process.env, home = os.homedir()) {
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "systemd", "user", LINUX_UNIT_NAME);
}

export function defaultWindowsPowerShellPath(env = process.env) {
  const systemRoot = env.SystemRoot ?? env.WINDIR;
  if (!systemRoot) {
    throw new Error("Windows SystemRoot/WINDIR is unavailable");
  }
  return path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export function parseAutostartArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  if (!command || !["install", "status", "restart", "uninstall"].includes(command)) {
    throw new Error("Usage: pnpm autostart <install|status|restart|uninstall> [--config <path>] [--env-file <path>]");
  }

  if (command !== "install" && args.length > 0) {
    throw new Error(`${command} does not accept install options`);
  }

  let configPath;
  let envFile;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option !== "--config" && option !== "--env-file") {
      throw new Error(`Unknown autostart option: ${option}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${option}`);
    }
    if (option === "--config") {
      if (configPath !== undefined) throw new Error("--config may be specified only once");
      configPath = path.resolve(value);
    } else {
      if (envFile !== undefined) throw new Error("--env-file may be specified only once");
      envFile = path.resolve(value);
    }
    index += 1;
  }

  return { command, configPath, envFile };
}

export function quoteWindowsArg(value) {
  if (value.length === 0) return '""';
  if (!/[\s"]/u.test(value)) return value;

  let result = '"';
  let backslashes = 0;
  for (const character of value) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      result += "\\".repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    result += "\\".repeat(backslashes) + character;
    backslashes = 0;
  }
  result += "\\".repeat(backslashes * 2) + '"';
  return result;
}

export function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function assertSingleLine(value, name) {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new Error(`${name} contains an unsupported control character`);
  }
  if (/\r|\n/u.test(value)) {
    throw new Error(`${name} must be a single line`);
  }
}

export function buildAgentArguments({ agentPath, configPath, envFile }) {
  const args = [agentPath, "--config", configPath];
  if (envFile) args.push("--env-file", envFile);
  return args;
}

export function quotePowerShellLiteral(value) {
  assertSingleLine(value, "PowerShell argument");
  return `'${value.replaceAll("'", "''")}'`;
}

export function encodePowerShellCommand(command) {
  return Buffer.from(command, "utf16le").toString("base64");
}

export function buildWindowsTaskXml({
  userSid,
  powershellPath,
  supervisorPath,
  nodePath,
  agentPath,
  repoRoot,
  configPath,
  envFile
}) {
  for (const [name, value] of Object.entries({
    userSid,
    powershellPath,
    supervisorPath,
    nodePath,
    agentPath,
    repoRoot,
    configPath
  })) {
    assertSingleLine(value, name);
  }
  if (envFile) assertSingleLine(envFile, "envFile");

  const arguments = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-File",
    supervisorPath,
    "-NodePath",
    nodePath,
    "-AgentPath",
    agentPath,
    "-RepoRoot",
    repoRoot,
    "-ConfigPath",
    configPath
  ];
  if (envFile) arguments.push("-EnvFile", envFile);
  const argumentsText = arguments.map(quoteWindowsArg).join(" ");

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Start PalmTTY Agent for the current user at sign-in.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${escapeXml(userSid)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${escapeXml(userSid)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapeXml(powershellPath)}</Command>
      <Arguments>${escapeXml(argumentsText)}</Arguments>
      <WorkingDirectory>${escapeXml(repoRoot)}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

export function buildWindowsTaskStatusPowerShellCommand(taskName = WINDOWS_TASK_NAME) {
  const taskNameLiteral = quotePowerShellLiteral(taskName);
  return `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)\n` +
    `$task = Get-ScheduledTask -TaskName ${taskNameLiteral} -ErrorAction SilentlyContinue\n` +
    `if ($null -eq $task) {\n` +
    `  [PSCustomObject]@{ installed = $false } | ConvertTo-Json -Compress\n` +
    `  exit 0\n` +
    `}\n` +
    `$info = Get-ScheduledTaskInfo -TaskName ${taskNameLiteral}\n` +
    `$lastRunTime = $null\n` +
    `if ($info.LastRunTime -ne [datetime]::MinValue) { $lastRunTime = $info.LastRunTime.ToUniversalTime().ToString('o') }\n` +
    `$nextRunTime = $null\n` +
    `if ($info.NextRunTime -ne [datetime]::MinValue) { $nextRunTime = $info.NextRunTime.ToUniversalTime().ToString('o') }\n` +
    `[PSCustomObject]@{\n` +
    `  installed = $true\n` +
    `  state = [string]$task.State\n` +
    `  lastRunTime = $lastRunTime\n` +
    `  nextRunTime = $nextRunTime\n` +
    `} | ConvertTo-Json -Compress`;
}

export function parseWindowsTaskStatus(output) {
  let parsed;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    throw new Error("Windows Task Scheduler returned an invalid status payload");
  }
  if (!parsed || typeof parsed !== "object" || typeof parsed.installed !== "boolean") {
    throw new Error("Windows Task Scheduler returned an invalid status payload");
  }
  if (!parsed.installed) return { installed: false };
  if (typeof parsed.state !== "string" || parsed.state.length === 0) {
    throw new Error("Windows Task Scheduler returned an invalid task state");
  }
  for (const key of ["lastRunTime", "nextRunTime"]) {
    const value = parsed[key];
    if (value !== null && value !== undefined && typeof value !== "string") {
      throw new Error(`Windows Task Scheduler returned an invalid ${key}`);
    }
  }
  return {
    installed: true,
    state: parsed.state.toLowerCase(),
    lastRunTime: parsed.lastRunTime ?? null,
    nextRunTime: parsed.nextRunTime ?? null
  };
}

export function quoteSystemdArg(value) {
  assertSingleLine(value, "systemd argument");
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%")}"`;
}

export function buildSystemdUserUnit({ nodePath, agentPath, repoRoot, configPath, envFile }) {
  const execArgs = [nodePath, ...buildAgentArguments({ agentPath, configPath, envFile })]
    .map(quoteSystemdArg)
    .join(" ");

  return `[Unit]
Description=PalmTTY Agent

[Service]
Type=simple
WorkingDirectory=${quoteSystemdArg(repoRoot)}
ExecStart=${execArgs}
Restart=on-failure
RestartSec=3s
# Session Workers are deliberately independent from the Agent control plane.
KillMode=process

[Install]
WantedBy=default.target
`;
}
