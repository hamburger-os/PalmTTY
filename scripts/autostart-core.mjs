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

const WINDOWS_JOB_SUPERVISOR_SOURCE = String.raw\`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class PalmTTYJobSupervisor
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK = 0x00001000;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint INFINITE = 0xFFFFFFFF;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint RESUME_FAILED = 0xFFFFFFFF;

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr hJob,
        int jobObjectInfoClass,
        IntPtr lpJobObjectInfo,
        uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string lpApplicationName,
        StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    public static int Run(string executable, string commandLine, string workingDirectory)
    {
        IntPtr job = IntPtr.Zero;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        bool completed = false;

        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) ThrowLastError("CreateJobObject");

            ConfigureJob(job);

            STARTUPINFO startup = new STARTUPINFO();
            startup.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
            StringBuilder mutableCommandLine = new StringBuilder(commandLine);

            if (!CreateProcess(
                executable,
                mutableCommandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                CREATE_SUSPENDED | CREATE_NO_WINDOW,
                IntPtr.Zero,
                workingDirectory,
                ref startup,
                out process))
            {
                ThrowLastError("CreateProcess");
            }

            if (!AssignProcessToJobObject(job, process.hProcess))
            {
                ThrowLastError("AssignProcessToJobObject");
            }

            if (ResumeThread(process.hThread) == RESUME_FAILED)
            {
                ThrowLastError("ResumeThread");
            }

            uint waitResult = WaitForSingleObject(process.hProcess, INFINITE);
            if (waitResult != WAIT_OBJECT_0)
            {
                ThrowLastError("WaitForSingleObject");
            }

            uint exitCode;
            if (!GetExitCodeProcess(process.hProcess, out exitCode))
            {
                ThrowLastError("GetExitCodeProcess");
            }

            completed = true;
            return unchecked((int)exitCode);
        }
        finally
        {
            if (!completed && process.hProcess != IntPtr.Zero)
            {
                TerminateProcess(process.hProcess, 1);
            }
            if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
            if (job != IntPtr.Zero) CloseHandle(job);
        }
    }

    private static void ConfigureJob(IntPtr job)
    {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION information =
            new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        information.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
            JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;

        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(information, buffer, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                buffer,
                (uint)size))
            {
                ThrowLastError("SetInformationJobObject");
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static void ThrowLastError(string operation)
    {
        throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }
}
\`;

export function buildWindowsAgentPowerShellCommand({
  nodePath,
  agentPath,
  repoRoot,
  configPath,
  envFile
}) {
  const commandLine = [nodePath, ...buildAgentArguments({ agentPath, configPath, envFile })]
    .map(quoteWindowsArg)
    .join(" ");
  return \`$ErrorActionPreference = 'Stop'
$source = @'
\${WINDOWS_JOB_SUPERVISOR_SOURCE}
'@
Add-Type -TypeDefinition $source -Language CSharp
$exitCode = [PalmTTYJobSupervisor]::Run(
  \${quotePowerShellLiteral(nodePath)},
  \${quotePowerShellLiteral(commandLine)},
  \${quotePowerShellLiteral(repoRoot)}
)
exit $exitCode\`;
}

export function buildWindowsTaskXml({
  userSid,
  powershellPath,
  nodePath,
  agentPath,
  repoRoot,
  configPath,
  envFile
}) {
  for (const [name, value] of Object.entries({
    userSid,
    powershellPath,
    nodePath,
    agentPath,
    repoRoot,
    configPath
  })) {
    assertSingleLine(value, name);
  }
  if (envFile) assertSingleLine(envFile, "envFile");

  const launcherCommand = buildWindowsAgentPowerShellCommand({
    nodePath,
    agentPath,
    repoRoot,
    configPath,
    envFile
  });
  const argumentsText = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-EncodedCommand",
    encodePowerShellCommand(launcherCommand)
  ].map(quoteWindowsArg).join(" ");

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
