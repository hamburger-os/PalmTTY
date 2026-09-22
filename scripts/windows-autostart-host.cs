using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

[DataContract]
internal sealed class Installation
{
    [DataMember(Name = "version", IsRequired = true)]
    public int Version { get; set; }

    [DataMember(Name = "nodePath", IsRequired = true)]
    public string NodePath { get; set; }

    [DataMember(Name = "agentPath", IsRequired = true)]
    public string AgentPath { get; set; }

    [DataMember(Name = "workingDirectory", IsRequired = true)]
    public string WorkingDirectory { get; set; }

    [DataMember(Name = "configPath", IsRequired = true)]
    public string ConfigPath { get; set; }

    [DataMember(Name = "envFile", EmitDefaultValue = false)]
    public string EnvFile { get; set; }
}

[DataContract]
internal sealed class RuntimeState
{
    [DataMember(Name = "hostPid")]
    public int HostPid { get; set; }

    [DataMember(Name = "agentPid")]
    public uint AgentPid { get; set; }

    [DataMember(Name = "startedAtUtc")]
    public string StartedAtUtc { get; set; }
}

internal static class Program
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

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
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

    [STAThread]
    private static int Main(string[] args)
    {
        string installationPath = null;
        try
        {
            installationPath = ParseInstallationPath(args);
            return Run(installationPath);
        }
        catch (Exception error)
        {
            WriteError(installationPath, error);
            return 1;
        }
    }

    private static int Run(string installationPath)
    {
        Installation installation = ReadJson<Installation>(installationPath);
        ValidateInstallation(installation);

        string stateDirectory = Path.GetDirectoryName(installationPath);
        string runtimePath = Path.Combine(stateDirectory, "runtime.json");
        string errorPath = Path.Combine(stateDirectory, "last-error.txt");
        TryDelete(errorPath);
        TryDelete(runtimePath);

        IntPtr job = IntPtr.Zero;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        bool completed = false;

        try
        {
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) ThrowLastError("CreateJobObject");
            ConfigureJob(job);

            string[] arguments = BuildAgentArguments(installation);
            STARTUPINFO startup = new STARTUPINFO();
            startup.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
            StringBuilder commandLine = BuildCommandLine(installation.NodePath, arguments);

            if (!CreateProcess(
                installation.NodePath,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                false,
                CREATE_SUSPENDED | CREATE_NO_WINDOW,
                IntPtr.Zero,
                installation.WorkingDirectory,
                ref startup,
                out process))
            {
                ThrowLastError("CreateProcess");
            }

            if (!AssignProcessToJobObject(job, process.hProcess))
            {
                ThrowLastError("AssignProcessToJobObject");
            }

            WriteJsonAtomically(runtimePath, new RuntimeState
            {
                HostPid = Process.GetCurrentProcess().Id,
                AgentPid = process.dwProcessId,
                StartedAtUtc = DateTime.UtcNow.ToString("o")
            });

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
            TryDelete(runtimePath);
            if (!completed && process.hProcess != IntPtr.Zero)
            {
                TerminateProcess(process.hProcess, 1);
            }
            if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
            if (job != IntPtr.Zero) CloseHandle(job);
        }
    }

    private static string ParseInstallationPath(string[] args)
    {
        if (args.Length != 2 || args[0] != "--installation" || String.IsNullOrWhiteSpace(args[1]))
        {
            throw new ArgumentException("Usage: palmtty-autostart-host.exe --installation <path>");
        }
        return Path.GetFullPath(args[1]);
    }

    private static void ValidateInstallation(Installation installation)
    {
        if (installation == null || installation.Version != 1)
        {
            throw new InvalidDataException("Unsupported PalmTTY autostart installation manifest");
        }
        RequireFile(installation.NodePath, "Node executable");
        RequireFile(installation.AgentPath, "PalmTTY Agent");
        RequireFile(installation.ConfigPath, "PalmTTY config");
        if (!String.IsNullOrWhiteSpace(installation.EnvFile))
        {
            RequireFile(installation.EnvFile, "Environment file");
        }
        if (String.IsNullOrWhiteSpace(installation.WorkingDirectory) ||
            !Directory.Exists(installation.WorkingDirectory))
        {
            throw new DirectoryNotFoundException("Working directory does not exist: " + installation.WorkingDirectory);
        }
    }

    private static void RequireFile(string filePath, string label)
    {
        if (String.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            throw new FileNotFoundException(label + " does not exist", filePath);
        }
    }

    private static string[] BuildAgentArguments(Installation installation)
    {
        if (String.IsNullOrWhiteSpace(installation.EnvFile))
        {
            return new[] {
                installation.AgentPath,
                "--config",
                installation.ConfigPath
            };
        }
        return new[] {
            installation.AgentPath,
            "--config",
            installation.ConfigPath,
            "--env-file",
            installation.EnvFile
        };
    }

    private static T ReadJson<T>(string filePath)
    {
        DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(T));
        using (FileStream stream = File.OpenRead(filePath))
        {
            return (T)serializer.ReadObject(stream);
        }
    }

    private static void WriteJsonAtomically<T>(string filePath, T value)
    {
        string tempPath = filePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(T));
        try
        {
            using (FileStream stream = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                serializer.WriteObject(stream, value);
                stream.Flush(true);
            }
            if (File.Exists(filePath)) File.Delete(filePath);
            File.Move(tempPath, filePath);
        }
        finally
        {
            TryDelete(tempPath);
        }
    }

    private static StringBuilder BuildCommandLine(string executable, string[] arguments)
    {
        StringBuilder result = new StringBuilder();
        result.Append(QuoteArgument(executable));
        foreach (string argument in arguments)
        {
            result.Append(' ');
            result.Append(QuoteArgument(argument));
        }
        return result;
    }

    private static string QuoteArgument(string value)
    {
        if (value.Length == 0) return "\"\"";

        bool needsQuotes = false;
        foreach (char character in value)
        {
            if (Char.IsWhiteSpace(character) || character == '"')
            {
                needsQuotes = true;
                break;
            }
        }
        if (!needsQuotes) return value;

        StringBuilder result = new StringBuilder();
        result.Append('"');
        int backslashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', backslashes * 2 + 1);
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append('\\', backslashes);
            result.Append(character);
            backslashes = 0;
        }
        result.Append('\\', backslashes * 2);
        result.Append('"');
        return result.ToString();
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

    private static void WriteError(string installationPath, Exception error)
    {
        try
        {
            string directory = !String.IsNullOrWhiteSpace(installationPath)
                ? Path.GetDirectoryName(Path.GetFullPath(installationPath))
                : AppDomain.CurrentDomain.BaseDirectory;
            Directory.CreateDirectory(directory);
            File.WriteAllText(
                Path.Combine(directory, "last-error.txt"),
                DateTime.UtcNow.ToString("o") + Environment.NewLine + error.ToString(),
                new UTF8Encoding(false)
            );
        }
        catch
        {
            // A GUI-subsystem launcher has no console. Error persistence is best effort.
        }
    }

    private static void TryDelete(string filePath)
    {
        try
        {
            if (!String.IsNullOrWhiteSpace(filePath) && File.Exists(filePath)) File.Delete(filePath);
        }
        catch
        {
            // Best-effort cleanup.
        }
    }
}
