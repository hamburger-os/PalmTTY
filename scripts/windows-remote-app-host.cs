using Microsoft.Win32.SafeHandles;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;

internal static class PalmTTYRemoteAppHost
{
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint RESUME_FAILED = 0xFFFFFFFF;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private const uint PROCESS_TERMINATE = 0x0001;
    private const uint PROCESS_SET_QUOTA = 0x0100;
    private const int JobObjectBasicAccountingInformation = 1;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

    private const int STD_INPUT_HANDLE = -10;
    private const int STD_OUTPUT_HANDLE = -11;
    private const int STD_ERROR_HANDLE = -12;

    private const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    private const int DWMWA_CLOAKED = 14;
    private const uint PW_RENDERFULLCONTENT = 0x00000002;
    private const int SW_RESTORE = 9;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 =
        new IntPtr(-4);

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;
    private const uint MOUSEEVENTF_MOVE = 0x0001;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const uint MOUSEEVENTF_HWHEEL = 0x01000;
    private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
    private const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;

    private const int SM_XVIRTUALSCREEN = 76;
    private const int SM_YVIRTUALSCREEN = 77;
    private const int SM_CXVIRTUALSCREEN = 78;
    private const int SM_CYVIRTUALSCREEN = 79;
    private const uint DESKTOP_READOBJECTS = 0x0001;
    private const int UOI_NAME = 2;
    private const int WTS_CONNECT_STATE = 8;
    private const int WTS_ACTIVE = 0;
    private const uint MONITOR_DEFAULTTONEAREST = 2;
    private const uint GA_ROOT = 2;

    [DataContract]
    private sealed class AppConfig
    {
        [DataMember(Name = "kind", IsRequired = true)]
        public string Kind { get; set; }

        [DataMember(Name = "appUserModelId")]
        public string AppUserModelId { get; set; }

        [DataMember(Name = "packageFamilyName")]
        public string PackageFamilyName { get; set; }

        [DataMember(Name = "executable")]
        public string Executable { get; set; }

        [DataMember(Name = "cwd", IsRequired = true)]
        public string Cwd { get; set; }

        [DataMember(Name = "args", IsRequired = true)]
        public string[] Args { get; set; }

        [DataMember(Name = "frameRate", IsRequired = true)]
        public int FrameRate { get; set; }

        [DataMember(Name = "maxWidth", IsRequired = true)]
        public int MaxWidth { get; set; }

        [DataMember(Name = "maxHeight", IsRequired = true)]
        public int MaxHeight { get; set; }
    }

    [DataContract]
    private sealed class ControlMessage
    {
        [DataMember(Name = "type")]
        public string Type { get; set; }

        [DataMember(Name = "action")]
        public string Action { get; set; }

        [DataMember(Name = "x")]
        public double X { get; set; }

        [DataMember(Name = "y")]
        public double Y { get; set; }

        [DataMember(Name = "dx")]
        public double Dx { get; set; }

        [DataMember(Name = "dy")]
        public double Dy { get; set; }

        [DataMember(Name = "button")]
        public int Button { get; set; }

        [DataMember(Name = "deltaX")]
        public double DeltaX { get; set; }

        [DataMember(Name = "deltaY")]
        public double DeltaY { get; set; }

        [DataMember(Name = "key")]
        public string Key { get; set; }

        [DataMember(Name = "count")]
        public int Count { get; set; }

        [DataMember(Name = "code")]
        public string Code { get; set; }

        [DataMember(Name = "ctrl")]
        public bool Ctrl { get; set; }

        [DataMember(Name = "alt")]
        public bool Alt { get; set; }

        [DataMember(Name = "shift")]
        public bool Shift { get; set; }

        [DataMember(Name = "meta")]
        public bool Meta { get; set; }

        [DataMember(Name = "text")]
        public string Text { get; set; }

        [DataMember(Name = "width")]
        public int Width { get; set; }

        [DataMember(Name = "height")]
        public int Height { get; set; }

        [DataMember(Name = "adaptWindow")]
        public bool AdaptWindow { get; set; }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;

        public int Width { get { return Math.Max(0, Right - Left); } }
        public int Height { get { return Math.Max(0, Bottom - Top); } }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [ComImport]
    [Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            uint options,
            out uint processId);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public long Affinity;
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

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public uint cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public INPUTUNION U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct INPUTUNION
    {
        [FieldOffset(0)]
        public MOUSEINPUT mi;

        [FieldOffset(0)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
    private delegate bool MonitorEnumProc(IntPtr monitor, IntPtr hdc, IntPtr rect, IntPtr data);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int nStdHandle);

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

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr hJob, uint uExitCode);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetPackageFamilyName(
        IntPtr process, ref uint length, StringBuilder familyName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

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
    private static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(
        IntPtr hJob,
        int jobObjectInfoClass,
        out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION lpJobObjectInfo,
        uint cbJobObjectInfoLength,
        IntPtr lpReturnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(
        uint dwDesiredAccess,
        bool bInheritHandle,
        uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsProcessInJob(
        IntPtr processHandle,
        IntPtr jobHandle,
        out bool result);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter,
        int x, int y, int cx, int cy, uint uFlags);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr hwnd,
        int dwAttribute,
        out RECT pvAttribute,
        int cbAttribute);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr hwnd,
        int dwAttribute,
        out int pvAttribute,
        int cbAttribute);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr lpdwProcessId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ProcessIdToSessionId(uint processId, out uint sessionId);
    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQuerySessionInformation(
        IntPtr server, uint sessionId, int infoClass,
        out IntPtr buffer, out uint bytesReturned);
    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr buffer);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll")]
    private static extern IntPtr GetThreadDesktop(uint threadId);
    [DllImport("user32.dll")]
    private static extern IntPtr GetProcessWindowStation();
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetUserObjectInformation(
        IntPtr handle, int index, StringBuilder buffer, uint bufferBytes,
        out uint bytesRequired);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumDisplayMonitors(
        IntPtr hdc, IntPtr clip, MonitorEnumProc callback, IntPtr data);
    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(
        uint nInputs,
        [In] INPUT[] pInputs,
        int cbSize);

    private static readonly object EnvironmentLock = new object();
    private static long LastEnvironmentCheckTicks;
    private static string LastEnvironmentIssue;
    private static readonly object TargetLock = new object();
    private static readonly object OutputLock = new object();
    private static readonly object AdaptLock = new object();
    private static bool AdaptRequested;
    private static int AdaptWidth;
    private static int AdaptHeight;
    private static IntPtr AdaptedWindow = IntPtr.Zero;
    private static RECT OriginalWindowRect;
    private static int LastAppliedWidth;
    private static int LastAppliedHeight;
    private static readonly object StateLock = new object();
    private static IntPtr JobHandle = IntPtr.Zero;
    private static IntPtr TargetWindow = IntPtr.Zero;
    private static RECT TargetRect;
    private static volatile bool Stopping;
    private static volatile int CaptureMaxWidth = 1280;
    private static volatile int CaptureMaxHeight = 800;
    private static string LastMediaState = "";
    private static string LastCaptureReason = "";
    private static string LastInputState = "";
    private static int LastCursorX = -2;
    private static int LastCursorY = -2;
    private static long LastCursorSampleTicks;
    private static long LastInputHealthPollTicks;
    private static string StartupStage = "bootstrap";
    private static BinaryWriter Output;
    private static StreamWriter ErrorOutput;

    [STAThread]
    private static int Main()
    {
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        IntPtr job = IntPtr.Zero;
        try
        {
            try { SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2); }
            catch { /* Windows 11 target, but capture can fail closed without DPI opt-in. */ }

            Stream inputStream = OpenStandardStream(STD_INPUT_HANDLE, FileAccess.Read);
            Stream outputStream = OpenStandardStream(STD_OUTPUT_HANDLE, FileAccess.Write);
            Stream errorStream = OpenStandardStream(STD_ERROR_HANDLE, FileAccess.Write);
            StreamReader input = new StreamReader(inputStream, new UTF8Encoding(false), false, 4096, false);
            Output = new BinaryWriter(outputStream, Encoding.UTF8, false);
            ErrorOutput = new StreamWriter(errorStream, new UTF8Encoding(false), 4096);
            ErrorOutput.AutoFlush = true;

            string firstLine = input.ReadLine();
            if (String.IsNullOrWhiteSpace(firstLine))
            {
                throw new InvalidDataException("Remote App host bootstrap was empty");
            }
            StartupStage = "validate-profile";
            AppConfig config = ParseJson<AppConfig>(firstLine);
            ValidateConfig(config);
            CaptureMaxWidth = config.MaxWidth;
            CaptureMaxHeight = config.MaxHeight;

            StartupStage = "create-job";
            job = CreateConfiguredJob();
            JobHandle = job;
            bool packaged = String.Equals(config.Kind, "packaged", StringComparison.Ordinal);
            StartupStage = packaged ? "activate-msix" : "create-win32";
            process = packaged
                ? StartPackagedApplication(config)
                : StartApplicationSuspended(config);
            StartupStage = "assign-job";
            if (!AssignProcessToJobObject(job, process.hProcess))
            {
                // Windows Store may deny assignment to an existing OS Job.
                // Reject that app rather than broadening capture to external PIDs.
                if (packaged) TerminateProcess(process.hProcess, 1);
                ThrowLastError("AssignProcessToJobObject (the packaged app must be newly launched and job-ownable)");
            }
            StartupStage = "resume-process";
            if (!packaged)
            {
                if (ResumeThread(process.hThread) == RESUME_FAILED)
                {
                    ThrowLastError("ResumeThread");
                }
                CloseHandle(process.hThread);
                process.hThread = IntPtr.Zero;
            }

            StartupStage = "ready";
            ErrorOutput.WriteLine("PALMTTY_APP_HOST_READY " + process.dwProcessId.ToString());
            PublishMediaState("waiting-for-window");
            PublishInputState(GetInputEnvironmentIssue() ?? "ready");

            Thread control = new Thread(delegate() { ControlLoop(input); });
            control.IsBackground = true;
            control.Name = "PalmTTY Remote App input";
            control.Start();

            Thread capture = new Thread(delegate() { CaptureLoop(config); });
            capture.IsBackground = true;
            capture.Name = "PalmTTY Remote App capture";
            capture.Start();

            // Independent pointer telemetry is not throttled by PrintWindow,
            // image encoding, or the configured 5-15 fps video capture loop.
            Thread cursor = new Thread(CursorLoop);
            cursor.IsBackground = true;
            cursor.Name = "PalmTTY Remote App cursor";
            cursor.Start();

            uint exitCode = WaitForJobExit(job, process.hProcess);
            Stopping = true;
            capture.Join(1000);
            cursor.Join(1000);
            return unchecked((int)exitCode);
        }
        catch (Exception error)
        {
            try
            {
                if (ErrorOutput != null)
                {
                    // A structured bounded error must reach the Agent before
                    // native WebRTC's later process teardown can fault.
                    string detail = error.Message ?? "";
                    detail = detail.Replace('\r', ' ').Replace('\n', ' ');
                    if (detail.Length > 180) detail = detail.Substring(0, 180);
                    ErrorOutput.WriteLine(
                        "PALMTTY_APP_HOST_ERROR stage=" + StartupStage +
                        " type=" + error.GetType().Name +
                        " hresult=0x" + error.HResult.ToString("X8") +
                        " detail=" + detail);
                }
            }
            catch { }
            return 1;
        }
        finally
        {
            Stopping = true;
            RestoreAdaptedWindow();
            if (process.hThread != IntPtr.Zero) CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) CloseHandle(process.hProcess);
            if (job != IntPtr.Zero) CloseHandle(job);
            JobHandle = IntPtr.Zero;
            if (Output != null) Output.Dispose();
            if (ErrorOutput != null) ErrorOutput.Dispose();
        }
    }

    private static Stream OpenStandardStream(int which, FileAccess access)
    {
        IntPtr handle = GetStdHandle(which);
        if (handle == IntPtr.Zero || handle.ToInt64() == -1)
        {
            throw new IOException("Required standard stream is unavailable");
        }
        SafeFileHandle safe = new SafeFileHandle(handle, false);
        return new FileStream(safe, access, 4096, false);
    }

    private static T ParseJson<T>(string source)
    {
        DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(T));
        using (MemoryStream stream = new MemoryStream(Encoding.UTF8.GetBytes(source)))
        {
            return (T)serializer.ReadObject(stream);
        }
    }

    private static void ValidateConfig(AppConfig config)
    {
        if (config == null) throw new InvalidDataException("Remote App config is missing");
        if (String.Equals(config.Kind, "win32", StringComparison.Ordinal))
        {
            if (String.IsNullOrWhiteSpace(config.Executable) || !File.Exists(config.Executable))
                throw new FileNotFoundException("Remote App executable does not exist", config.Executable);
        }
        else if (String.Equals(config.Kind, "packaged", StringComparison.Ordinal))
        {
            if (String.IsNullOrWhiteSpace(config.PackageFamilyName) ||
                String.IsNullOrWhiteSpace(config.AppUserModelId) ||
                !config.AppUserModelId.StartsWith(
                    config.PackageFamilyName + "!", StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("MSIX package identity is invalid");
        }
        else throw new InvalidDataException("Unsupported Remote App launch kind");
        if (String.IsNullOrWhiteSpace(config.Cwd) || !Directory.Exists(config.Cwd))
        {
            throw new DirectoryNotFoundException("Remote App working directory does not exist: " + config.Cwd);
        }
        if (config.Args == null || config.Args.Length > 32) throw new InvalidDataException("Remote App args are invalid");
        int argumentCharacters = 0;
        foreach (string argument in config.Args)
        {
            if (argument != null) argumentCharacters = checked(argumentCharacters + argument.Length);
        }
        if (argumentCharacters > 24000) throw new InvalidDataException("Remote App argv is too large");
        if (config.FrameRate < 5 || config.FrameRate > 15) throw new InvalidDataException("Remote App frame rate is invalid");
        if (config.MaxWidth < 320 || config.MaxWidth > 1600) throw new InvalidDataException("Remote App maxWidth is invalid");
        if (config.MaxHeight < 240 || config.MaxHeight > 1000) throw new InvalidDataException("Remote App maxHeight is invalid");
    }

    private static IntPtr CreateConfiguredJob()
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) ThrowLastError("CreateJobObject");

        JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(info, buffer, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                buffer,
                (uint)size))
            {
                ThrowLastError("SetInformationJobObject");
            }
            return job;
        }
        catch
        {
            CloseHandle(job);
            throw;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static PROCESS_INFORMATION StartPackagedApplication(AppConfig config)
    {
        // Do not attach to an existing Store singleton; that would grant
        // control over a window PalmTTY never launched.
        HashSet<uint> previous = new HashSet<uint>();
        foreach (Process existing in Process.GetProcesses())
        {
            try { previous.Add(unchecked((uint)existing.Id)); }
            catch { }
            finally { existing.Dispose(); }
        }

        Type type = Type.GetTypeFromCLSID(
            new Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C"), true);
        IApplicationActivationManager activation =
            (IApplicationActivationManager)Activator.CreateInstance(type);
        uint pid = 0;
        try
        {
            StringBuilder arguments = new StringBuilder();
            foreach (string argument in config.Args)
            {
                if (arguments.Length != 0) arguments.Append(' ');
                arguments.Append(QuoteArgument(argument ?? ""));
            }
            int hr = activation.ActivateApplication(
                config.AppUserModelId, arguments.ToString(), 0, out pid);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        }
        finally { Marshal.ReleaseComObject(activation); }

        if (pid == 0) throw new InvalidOperationException("MSIX activation returned no process");
        if (previous.Contains(pid))
            throw new InvalidOperationException(
                "MSIX application reused an existing process. Close the app on the PC and try again.");

        IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION |
            PROCESS_TERMINATE | PROCESS_SET_QUOTA, false, pid);
        if (handle == IntPtr.Zero) ThrowLastError("OpenProcess activated MSIX app");
        bool accepted = false;
        try
        {
            uint length = 0;
            int result = GetPackageFamilyName(handle, ref length, null);
            if (result != 122 || length < 2 || length > 257)
                throw new InvalidOperationException("Activated process has no verifiable package family");
            StringBuilder family = new StringBuilder((int)length);
            result = GetPackageFamilyName(handle, ref length, family);
            if (result != 0 || !String.Equals(
                family.ToString(), config.PackageFamilyName, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Activated process package identity mismatch");

            PROCESS_INFORMATION info = new PROCESS_INFORMATION();
            info.hProcess = handle;
            info.dwProcessId = pid;
            accepted = true;
            return info;
        }
        finally
        {
            if (!accepted)
            {
                // Activation may return a broker or unrelated process when
                // package verification fails; do not terminate an unverified PID.
                CloseHandle(handle);
            }
        }
    }

    private static PROCESS_INFORMATION StartApplicationSuspended(AppConfig config)
    {
        STARTUPINFO startup = new STARTUPINFO();
        startup.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFO));
        PROCESS_INFORMATION process;
        StringBuilder commandLine = new StringBuilder();
        commandLine.Append(QuoteArgument(config.Executable));
        foreach (string argument in config.Args)
        {
            commandLine.Append(' ');
            commandLine.Append(QuoteArgument(argument ?? ""));
        }
        if (commandLine.Length > 30000)
        {
            throw new InvalidDataException("Remote App command line exceeds the Windows process limit");
        }

        if (!CreateProcess(
            config.Executable,
            commandLine,
            IntPtr.Zero,
            IntPtr.Zero,
            false,
            CREATE_SUSPENDED,
            IntPtr.Zero,
            config.Cwd,
            ref startup,
            out process))
        {
            ThrowLastError("CreateProcess");
        }
        return process;
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

    private static void ControlLoop(StreamReader input)
    {
        try
        {
            string line;
            while (!Stopping && (line = input.ReadLine()) != null)
            {
                if (line.Length == 0 || line.Length > 32768) continue;
                try
                {
                    ControlMessage message = ParseJson<ControlMessage>(line);
                    HandleControl(message);
                }
                catch
                {
                    // Invalid browser control is rejected without affecting capture.
                }
            }
        }
        catch { }
        Stopping = true;
        IntPtr job = JobHandle;
        if (job != IntPtr.Zero)
        {
            TerminateJobObject(job, 0);
        }
    }

    private static void CaptureLoop(AppConfig config)
    {
        int delay = Math.Max(66, 1000 / config.FrameRate);
        int captureFailures = 0;
        bool streaming = false;
        while (!Stopping)
        {
            try
            {
                IntPtr hwnd;
                RECT rect;
                if (!TryResolveOwnedWindow(out hwnd, out rect))
                {
                    captureFailures = 0;
                    streaming = false;
                    lock (TargetLock)
                    {
                        TargetWindow = IntPtr.Zero;
                        TargetRect = new RECT();
                    }
                    PublishCaptureReason("window-not-found");
                    PublishMediaState("waiting-for-window");
                    PublishCursorHidden();
                }
                else
                {
                    ApplyRequestedWindowSize(hwnd);
                    // The window may enforce its own minimum dimensions.
                    // Input/capture always use the actual post-resize bounds.
                    if (!TryGetWindowBounds(hwnd, out rect))
                    {
                        PublishCaptureReason("window-not-found");
                        PublishMediaState("waiting-for-window");
                        PublishCursorHidden();
                        Thread.Sleep(delay);
                        continue;
                    }
                    if (!streaming && captureFailures == 0)
                    {
                        PublishMediaState("waiting-for-frame");
                    }
                    if (CaptureWindow(hwnd, rect, CaptureMaxWidth, CaptureMaxHeight))
                    {
                        captureFailures = 0;
                        streaming = true;
                        PublishMediaState("streaming");
                    }
                    else
                    {
                        captureFailures += 1;
                        if (captureFailures >= Math.Max(8, config.FrameRate * 2))
                        {
                            streaming = false;
                            PublishMediaState("capture-unavailable");
                        }
                    }
                }
            }
            catch
            {
                PublishCursorHidden();
                PublishCaptureReason("capture-exception");
                captureFailures += 1;
                if (captureFailures >= Math.Max(8, config.FrameRate * 2))
                {
                    streaming = false;
                    PublishMediaState("capture-unavailable");
                }
            }
            Thread.Sleep(delay);
        }
    }

    // This lightweight 30 Hz sampler stays responsive even if PrintWindow
    // blocks or a native frame encoder takes longer than the video interval.
    // Revalidate job ownership and current geometry for every visible sample.
    private static void CursorLoop()
    {
        while (!Stopping)
        {
            try
            {
                // A peer must see lock/disconnect/display changes without
                // having to click the inaccessible application first.
                long now = DateTime.UtcNow.Ticks;
                if (now - LastInputHealthPollTicks >= TimeSpan.TicksPerSecond)
                {
                    LastInputHealthPollTicks = now;
                    string issue = GetInputEnvironmentIssue();
                    if (issue != null) PublishInputState(issue);
                    else
                    {
                        lock (StateLock)
                        {
                            if (LastInputState == "session-disconnected" ||
                                LastInputState == "desktop-unavailable" ||
                                LastInputState == "display-unavailable")
                                PublishInputStateLocked("ready");
                        }
                    }
                }
                IntPtr hwnd;
                lock (TargetLock) { hwnd = TargetWindow; }
                RECT rect;
                if (hwnd == IntPtr.Zero || !IsWindowVisible(hwnd) ||
                    !TryGetWindowBounds(hwnd, out rect))
                {
                    PublishCursorHidden();
                }
                else
                {
                    PublishCursorForOwnedWindow(hwnd, rect);
                }
            }
            catch { PublishCursorHidden(); }
            Thread.Sleep(33);
        }
        PublishCursorHidden();
    }

    // Only normalized coordinates inside the verified application window leave
    // the host. Desktop positions, unrelated windows and cursor imagery never do.
    private static void PublishCursorForOwnedWindow(IntPtr hwnd, RECT rect)
    {
        POINT point;
        if (!IsOwnedWindow(hwnd) || !GetCursorPos(out point) ||
            point.X < rect.Left || point.X >= rect.Right ||
            point.Y < rect.Top || point.Y >= rect.Bottom)
        {
            PublishCursorHidden();
            return;
        }
        int x = (int)Math.Round((point.X - rect.Left) * 1000000.0 / Math.Max(1, rect.Width - 1));
        int y = (int)Math.Round((point.Y - rect.Top) * 1000000.0 / Math.Max(1, rect.Height - 1));
        PublishCursor(Math.Max(0, Math.Min(1000000, x)),
            Math.Max(0, Math.Min(1000000, y)));
    }

    private static void PublishCursorHidden()
    {
        PublishCursor(-1, -1);
    }

    private static void PublishCursor(int x, int y)
    {
        lock (StateLock)
        {
            long now = DateTime.UtcNow.Ticks;
            // Refresh unchanged positions once a second so a new peer receives
            // a stable snapshot without increasing media/IPC traffic every frame.
            if (x == LastCursorX && y == LastCursorY &&
                now - LastCursorSampleTicks < TimeSpan.TicksPerSecond) return;
            // Visibility changes must be immediate. Rate-limit only visible
            // position updates; never delay an off-window hiding transition.
            if (x >= 0 && LastCursorX >= 0 &&
                now - LastCursorSampleTicks < TimeSpan.TicksPerMillisecond * 30) return;
            LastCursorX = x;
            LastCursorY = y;
            LastCursorSampleTicks = now;
            if (ErrorOutput != null)
                ErrorOutput.WriteLine("PALMTTY_APP_HOST_CURSOR " +
                    x.ToString(System.Globalization.CultureInfo.InvariantCulture) + " " +
                    y.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
    }

    private static void PublishInputState(string state)
    {
        lock (StateLock) PublishInputStateLocked(state);
    }

    private static void PublishInputStateLocked(string state)
    {
        if (LastInputState == state) return;
        LastInputState = state;
        if (ErrorOutput != null)
            ErrorOutput.WriteLine("PALMTTY_APP_HOST_INPUT_STATE " + state);
    }

    private static string UserObjectName(IntPtr handle)
    {
        if (handle == IntPtr.Zero) return null;
        StringBuilder name = new StringBuilder(128);
        uint needed;
        if (!GetUserObjectInformation(handle, UOI_NAME,
            name, (uint)(name.Capacity * 2), out needed)) return null;
        return name.ToString();
    }

    private static string GetInputEnvironmentIssue()
    {
        lock (EnvironmentLock)
        {
            long now = DateTime.UtcNow.Ticks;
            if (LastEnvironmentCheckTicks != 0 &&
                now - LastEnvironmentCheckTicks < TimeSpan.TicksPerMillisecond * 100)
                return LastEnvironmentIssue;
            LastEnvironmentIssue = ProbeInputEnvironment();
            LastEnvironmentCheckTicks = now;
            return LastEnvironmentIssue;
        }
    }

    // A captured HWND is not proof of a usable input desktop. Refuse to
    // target Winlogon, a disconnected RDP session, or a non-interactive task.
    private static string ProbeInputEnvironment()
    {
        uint sessionId;
        if (!ProcessIdToSessionId((uint)Process.GetCurrentProcess().Id,
            out sessionId)) return "session-disconnected";
        IntPtr info = IntPtr.Zero;
        uint length;
        try
        {
            if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId,
                WTS_CONNECT_STATE, out info, out length) ||
                info == IntPtr.Zero || length < 4 ||
                Marshal.ReadInt32(info) != WTS_ACTIVE)
                return "session-disconnected";
        }
        finally { if (info != IntPtr.Zero) WTSFreeMemory(info); }

        string station = UserObjectName(GetProcessWindowStation());
        if (!String.Equals(station, "WinSta0", StringComparison.OrdinalIgnoreCase))
            return "desktop-unavailable";
        IntPtr inputDesktop = OpenInputDesktop(0, false, DESKTOP_READOBJECTS);
        if (inputDesktop == IntPtr.Zero) return "desktop-unavailable";
        try
        {
            string inputName = UserObjectName(inputDesktop);
            string appName = UserObjectName(GetThreadDesktop(GetCurrentThreadId()));
            if (!String.Equals(inputName, "Default", StringComparison.OrdinalIgnoreCase) ||
                !String.Equals(appName, inputName, StringComparison.OrdinalIgnoreCase))
                return "desktop-unavailable";
        }
        finally { CloseDesktop(inputDesktop); }

        if (GetSystemMetrics(SM_CXVIRTUALSCREEN) < 1 ||
            GetSystemMetrics(SM_CYVIRTUALSCREEN) < 1)
            return "display-unavailable";
        bool found = false;
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero,
            delegate(IntPtr monitor, IntPtr hdc, IntPtr rect, IntPtr data)
            {
                found = true;
                return false;
            }, IntPtr.Zero);
        // A dummy HDMI output or signed virtual display is valid; a monitor
        // physically connected is not required. No driver is installed here.
        return found ? null : "display-unavailable";
    }

    private static void PublishMediaState(string state)
    {
        lock (StateLock)
        {
            if (String.Equals(LastMediaState, state, StringComparison.Ordinal)) return;
            LastMediaState = state;
            if (ErrorOutput != null)
            {
                ErrorOutput.WriteLine("PALMTTY_APP_HOST_STATE " + state);
            }
        }
    }

    private static void PublishCaptureReason(string reason)
    {
        lock (StateLock)
        {
            if (String.Equals(LastCaptureReason, reason, StringComparison.Ordinal)) return;
            LastCaptureReason = reason;
            if (ErrorOutput != null)
                ErrorOutput.WriteLine("PALMTTY_APP_HOST_CAPTURE_REASON " + reason);
        }
    }

    private static bool TryResolveOwnedWindow(out IntPtr hwnd, out RECT rect)
    {
        IntPtr best = IntPtr.Zero;
        RECT bestRect = new RECT();
        long bestArea = 0;
        IntPtr foreground = GetForegroundWindow();

        EnumWindows(delegate(IntPtr candidate, IntPtr unused)
        {
            if (!IsWindowVisible(candidate)) return true;
            int cloaked;
            if (DwmGetWindowAttribute(
                candidate,
                DWMWA_CLOAKED,
                out cloaked,
                Marshal.SizeOf(typeof(int))) == 0 && cloaked != 0)
            {
                return true;
            }

            uint pid;
            GetWindowThreadProcessId(candidate, out pid);
            if (!IsOwnedProcess(pid)) return true;

            RECT bounds;
            if (DwmGetWindowAttribute(
                candidate,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                out bounds,
                Marshal.SizeOf(typeof(RECT))) != 0)
            {
                if (!GetWindowRect(candidate, out bounds)) return true;
            }
            long area = (long)bounds.Width * (long)bounds.Height;
            if (bounds.Width < 64 || bounds.Height < 64) return true;
            if (candidate == foreground)
            {
                best = candidate;
                bestRect = bounds;
                bestArea = Int64.MaxValue;
                return true;
            }
            if (area <= bestArea) return true;
            best = candidate;
            bestRect = bounds;
            bestArea = area;
            return true;
        }, IntPtr.Zero);

        if (best == IntPtr.Zero)
        {
            hwnd = IntPtr.Zero;
            rect = new RECT();
            return false;
        }

        lock (TargetLock)
        {
            TargetWindow = best;
            TargetRect = bestRect;
        }
        hwnd = best;
        rect = bestRect;
        return true;
    }

    private static bool IsOwnedProcess(uint pid)
    {
        IntPtr job = JobHandle;
        if (job == IntPtr.Zero || pid == 0) return false;

        IntPtr processHandle = OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION,
            false,
            pid);
        if (processHandle == IntPtr.Zero) return false;
        try
        {
            bool inJob;
            return IsProcessInJob(processHandle, job, out inJob) && inJob;
        }
        finally
        {
            CloseHandle(processHandle);
        }
    }

    private static uint WaitForJobExit(IntPtr job, IntPtr rootProcess)
    {
        while (true)
        {
            JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting;
            if (!QueryInformationJobObject(
                job,
                JobObjectBasicAccountingInformation,
                out accounting,
                (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)),
                IntPtr.Zero))
            {
                ThrowLastError("QueryInformationJobObject");
            }
            if (accounting.ActiveProcesses == 0) break;
            Thread.Sleep(100);
        }

        uint exitCode;
        if (!GetExitCodeProcess(rootProcess, out exitCode))
        {
            ThrowLastError("GetExitCodeProcess");
        }
        return exitCode;
    }

    private static bool TryGetWindowBounds(IntPtr hwnd, out RECT bounds)
    {
        if (!IsOwnedWindow(hwnd))
        {
            bounds = new RECT();
            return false;
        }
        if (DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            out bounds,
            Marshal.SizeOf(typeof(RECT))) != 0)
        {
            if (!GetWindowRect(hwnd, out bounds)) return false;
        }
        return bounds.Width >= 1 && bounds.Height >= 1;
    }

    // Adaptation is explicit, per-session, and constrained to the nearest
    // active display WORK area (taskbar excluded). No virtual driver, monitor
    // changes, system display setting or arbitrary window can be touched.
    private static void ApplyRequestedWindowSize(IntPtr hwnd)
    {
        lock (AdaptLock)
        {
            if (!AdaptRequested || !IsOwnedWindow(hwnd)) return;
            string issue = GetInputEnvironmentIssue();
            if (issue != null)
            {
                PublishInputState(issue);
                return;
            }
            IntPtr monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            MONITORINFO info = new MONITORINFO();
            info.cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFO));
            if (monitor == IntPtr.Zero || !GetMonitorInfo(monitor, ref info) ||
                info.rcWork.Width < 320 || info.rcWork.Height < 240)
            {
                PublishInputState("display-unavailable");
                return;
            }
            int requestedWidth = Math.Max(320, Math.Min(1600, AdaptWidth));
            int requestedHeight = Math.Max(240, Math.Min(1000, AdaptHeight));
            RECT current;
            if (!GetWindowRect(hwnd, out current)) return;
            if (AdaptedWindow != hwnd)
            {
                RestoreAdaptedWindowLocked();
                if (!GetWindowRect(hwnd, out current)) return;
                OriginalWindowRect = current;
                AdaptedWindow = hwnd;
            }
            // PrintWindow uses a DWM-visible image; SetWindowPos sizes the
            // outer HWND. Compensate at most 32px of invisible resize margins.
            RECT visible;
            int extraWidth = 0, extraHeight = 0;
            if (TryGetWindowBounds(hwnd, out visible))
            {
                extraWidth = Math.Max(0, Math.Min(32, current.Width - visible.Width));
                extraHeight = Math.Max(0, Math.Min(32, current.Height - visible.Height));
            }
            int desiredWidth = requestedWidth + extraWidth;
            int desiredHeight = requestedHeight + extraHeight;
            double scale = Math.Min(1.0, Math.Min(
                info.rcWork.Width / (double)desiredWidth,
                info.rcWork.Height / (double)desiredHeight));
            int width = Math.Max(1, (int)Math.Floor(desiredWidth * scale));
            int height = Math.Max(1, (int)Math.Floor(desiredHeight * scale));
            bool first = LastAppliedWidth != requestedWidth ||
                LastAppliedHeight != requestedHeight;
            bool outsideWork = current.Left < info.rcWork.Left ||
                current.Top < info.rcWork.Top ||
                current.Right > info.rcWork.Right ||
                current.Bottom > info.rcWork.Bottom;
            if (!first && !outsideWork) return;

            int x = Math.Max(info.rcWork.Left,
                Math.Min(info.rcWork.Right - width, current.Left));
            int y = Math.Max(info.rcWork.Top,
                Math.Min(info.rcWork.Bottom - height, current.Top));
            // Initial phone adaptation must not push the lower editor below
            // the taskbar; center only when the original position won't fit.
            if (first && (current.Left + width > info.rcWork.Right ||
                          current.Top + height > info.rcWork.Bottom))
            {
                x = info.rcWork.Left + (info.rcWork.Width - width) / 2;
                y = info.rcWork.Top + (info.rcWork.Height - height) / 2;
            }
            if (SetWindowPos(hwnd, IntPtr.Zero, x, y, width, height,
                SWP_NOZORDER | SWP_NOACTIVATE))
            {
                LastAppliedWidth = requestedWidth;
                LastAppliedHeight = requestedHeight;
                // Minimum-size constrained apps may still exceed this work
                // area; guarded pointer hit-testing remains authoritative.
                RECT actual;
                if (!GetWindowRect(hwnd, out actual) ||
                    actual.Left < info.rcWork.Left || actual.Top < info.rcWork.Top ||
                    actual.Right > info.rcWork.Right ||
                    actual.Bottom > info.rcWork.Bottom)
                    PublishCaptureReason("window-resize-rejected");
            }
            else PublishCaptureReason("window-resize-rejected");
        }
    }

    private static void RestoreAdaptedWindow()
    {
        lock (AdaptLock) RestoreAdaptedWindowLocked();
    }

    private static void RestoreAdaptedWindowLocked()
    {
        IntPtr hwnd = AdaptedWindow;
        AdaptedWindow = IntPtr.Zero;
        LastAppliedWidth = 0;
        LastAppliedHeight = 0;
        if (hwnd == IntPtr.Zero || !IsOwnedWindow(hwnd)) return;
        RECT original = OriginalWindowRect;
        if (original.Width < 64 || original.Height < 64) return;
        // Restore both original size and position on switch-off/shutdown.
        SetWindowPos(hwnd, IntPtr.Zero, original.Left, original.Top,
            original.Width, original.Height, SWP_NOZORDER | SWP_NOACTIVATE);
    }

    private static bool CaptureWindow(IntPtr hwnd, RECT rect, int maxWidth, int maxHeight)
    {
        // Ownership is revalidated immediately before capture, not merely
        // during an earlier EnumWindows callback (HWND may be recycled).
        if (!IsOwnedWindow(hwnd))
        {
            PublishCaptureReason("window-not-found");
            return false;
        }
        int sourceWidth = rect.Width;
        int sourceHeight = rect.Height;
        if (
            sourceWidth <= 0 ||
            sourceHeight <= 0 ||
            sourceWidth > 4096 ||
            sourceHeight > 4096 ||
            (long)sourceWidth * (long)sourceHeight > 12000000L)
        {
            PublishCaptureReason("window-too-large");
            return false;
        }

        using (Bitmap source = new Bitmap(sourceWidth, sourceHeight, PixelFormat.Format32bppArgb))
        {
            bool ok = PrintOwnedWindow(hwnd, source, PW_RENDERFULLCONTENT);
            // PW_RENDERFULLCONTENT can return TRUE while leaving a blank
            // bitmap. Retry only the same owned HWND with standard PrintWindow;
            // never read the desktop/window DC or include occluding windows.
            if (!ok || !HasVisiblePixels(source))
            {
                if (!IsOwnedWindow(hwnd))
                {
                    PublishCaptureReason("window-not-found");
                    return false;
                }
                using (Graphics clear = Graphics.FromImage(source))
                    clear.Clear(Color.Transparent);
                ok = PrintOwnedWindow(hwnd, source, 0);
            }
            if (!ok)
            {
                PublishCaptureReason("printwindow-failed");
                return false;
            }
            // Uniform near-black desktop themes and splash screens may be
            // legitimate. Keep forwarding a successful PrintWindow frame, but
            // report the ambiguity instead of declaring video unavailable.
            PublishCaptureReason(HasVisiblePixels(source) ? "none" : "blank-window");

            double scale = Math.Min(
                1.0,
                Math.Min((double)maxWidth / sourceWidth, (double)maxHeight / sourceHeight));
            int width = Math.Max(2, (int)Math.Round(sourceWidth * scale));
            int height = Math.Max(2, (int)Math.Round(sourceHeight * scale));
            width &= ~1;
            height &= ~1;

            if (width == sourceWidth && height == sourceHeight)
            {
                return WriteBitmap(source);
            }

            using (Bitmap scaled = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            using (Graphics graphics = Graphics.FromImage(scaled))
            {
                graphics.CompositingMode = CompositingMode.SourceCopy;
                graphics.InterpolationMode = InterpolationMode.HighQualityBilinear;
                graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
                graphics.DrawImage(
                    source,
                    new Rectangle(0, 0, width, height),
                    0,
                    0,
                    sourceWidth,
                    sourceHeight,
                    GraphicsUnit.Pixel);
                return WriteBitmap(scaled);
            }
        }
    }

    private static bool PrintOwnedWindow(IntPtr hwnd, Bitmap target, uint flags)
    {
        using (Graphics graphics = Graphics.FromImage(target))
        {
            IntPtr hdc = graphics.GetHdc();
            try { return PrintWindow(hwnd, hdc, flags); }
            finally { graphics.ReleaseHdc(hdc); }
        }
    }

    private static bool HasVisiblePixels(Bitmap bitmap)
    {
        // PrintWindow success means API success, not visible content. A sparse
        // bounded scan is enough to detect common entirely blank captures;
        // do not send a misleading black frame as successful video.
        int stepX = Math.Max(1, bitmap.Width / 16);
        int stepY = Math.Max(1, bitmap.Height / 16);
        for (int y = stepY / 2; y < bitmap.Height; y += stepY)
        {
            for (int x = stepX / 2; x < bitmap.Width; x += stepX)
            {
                Color pixel = bitmap.GetPixel(x, y);
                if (pixel.R > 4 || pixel.G > 4 || pixel.B > 4) return true;
            }
        }
        return false;
    }

    private static bool WriteBitmap(Bitmap bitmap)
    {
        Rectangle rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
        BitmapData data = bitmap.LockBits(
            rectangle,
            ImageLockMode.ReadOnly,
            PixelFormat.Format32bppArgb);
        try
        {
            int rowBytes = checked(bitmap.Width * 4);
            int payloadBytes = checked(rowBytes * bitmap.Height);
            if (payloadBytes > 8 * 1024 * 1024)
            {
                PublishCaptureReason("frame-write-failed");
                return false;
            }
            byte[] rgba = new byte[payloadBytes];
            byte[] row = new byte[rowBytes];

            for (int y = 0; y < bitmap.Height; y += 1)
            {
                IntPtr rowPointer = IntPtr.Add(data.Scan0, y * data.Stride);
                Marshal.Copy(rowPointer, row, 0, rowBytes);
                int target = y * rowBytes;
                for (int x = 0; x < bitmap.Width; x += 1)
                {
                    int source = x * 4;
                    int destination = target + source;
                    rgba[destination] = row[source + 2];
                    rgba[destination + 1] = row[source + 1];
                    rgba[destination + 2] = row[source];
                    rgba[destination + 3] = row[source + 3];
                }
            }

            lock (OutputLock)
            {
                Output.Write(new byte[] { (byte)'P', (byte)'T', (byte)'F', (byte)'1' });
                Output.Write((UInt32)bitmap.Width);
                Output.Write((UInt32)bitmap.Height);
                Output.Write((UInt32)payloadBytes);
                Output.Write(rgba);
                Output.Flush();
            }
            return true;
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static void HandleControl(ControlMessage message)
    {
        if (message == null || String.IsNullOrWhiteSpace(message.Type)) return;
        if (message.Type == "display")
        {
            int width = Math.Max(320, Math.Min(1600, message.Width));
            int height = Math.Max(240, Math.Min(1000, message.Height));
            CaptureMaxWidth = width & ~1;
            CaptureMaxHeight = height & ~1;
            lock (AdaptLock)
            {
                AdaptRequested = message.AdaptWindow;
                AdaptWidth = CaptureMaxWidth;
                AdaptHeight = CaptureMaxHeight;
                if (!AdaptRequested) RestoreAdaptedWindowLocked();
            }
            return;
        }

        string environmentIssue = GetInputEnvironmentIssue();
        if (environmentIssue != null)
        {
            PublishInputState(environmentIssue);
            return;
        }
        IntPtr hwnd;
        RECT rect;
        lock (TargetLock)
        {
            hwnd = TargetWindow;
            rect = TargetRect;
        }
        if (hwnd == IntPtr.Zero || !IsOwnedWindow(hwnd))
        {
            PublishInputState("window-unavailable");
            return;
        }

        if (message.Type == "pointer")
        {
            // Most drag/move events already target the foreground window.
            // Avoid repeatedly restoring it and attaching input threads.
            if ((GetForegroundWindow() != hwnd && !ActivateWindow(hwnd)) ||
                !TryGetWindowBounds(hwnd, out rect))
            {
                PublishInputState("focus-denied");
                return;
            }
            int x = rect.Left + (int)Math.Round(Clamp01(message.X) * Math.Max(1, rect.Width - 1));
            int y = rect.Top + (int)Math.Round(Clamp01(message.Y) * Math.Max(1, rect.Height - 1));
            if (!IsPointOnCapturedWindow(hwnd, x, y))
            {
                PublishInputState("window-occluded");
                return;
            }
            MoveAbsolute(x, y);
            if (GetForegroundWindow() != hwnd)
            {
                PublishInputState("focus-denied");
                return;
            }
            if (message.Action == "down" && !IsPointOnCapturedWindow(hwnd, x, y))
            {
                PublishInputState("window-occluded");
                return;
            }
            ApplyPointerAction(message.Action, message.Button);
            return;
        }

        if (message.Type == "pointerRelative")
        {
            // Most drag/move events already target the foreground window.
            // Avoid repeatedly restoring it and attaching input threads.
            if ((GetForegroundWindow() != hwnd && !ActivateWindow(hwnd)) ||
                !TryGetWindowBounds(hwnd, out rect))
            {
                PublishInputState("focus-denied");
                return;
            }
            POINT point;
            if (!GetCursorPos(out point))
            {
                PublishInputState("focus-denied");
                return;
            }
            int x = Math.Max(rect.Left, Math.Min(rect.Right - 1, point.X + (int)Math.Round(message.Dx * rect.Width)));
            int y = Math.Max(rect.Top, Math.Min(rect.Bottom - 1, point.Y + (int)Math.Round(message.Dy * rect.Height)));
            if (!IsPointOnCapturedWindow(hwnd, x, y))
            {
                PublishInputState("window-occluded");
                return;
            }
            MoveAbsolute(x, y);
            if (GetForegroundWindow() != hwnd)
            {
                PublishInputState("focus-denied");
                return;
            }
            if (message.Action == "down" && !IsPointOnCapturedWindow(hwnd, x, y))
            {
                PublishInputState("window-occluded");
                return;
            }
            ApplyPointerAction(message.Action, message.Button);
            return;
        }

        if (message.Type == "wheel")
        {
            if ((GetForegroundWindow() != hwnd && !ActivateWindow(hwnd)) ||
                GetForegroundWindow() != hwnd)
            {
                PublishInputState("focus-denied");
                return;
            }
            POINT pointer;
            if (!GetCursorPos(out pointer) ||
                !IsPointOnCapturedWindow(hwnd, pointer.X, pointer.Y))
            {
                PublishInputState("window-occluded");
                return;
            }
            SendWheel(message.DeltaX, message.DeltaY);
            return;
        }

        if (message.Type == "text")
        {
            // An already-foreground owned app must keep its actual focused
            // child edit control. Repeated SetFocus(hwnd) breaks text editing.
            if ((GetForegroundWindow() != hwnd && !ActivateWindow(hwnd)) ||
                GetForegroundWindow() != hwnd)
            {
                PublishInputState("focus-denied");
                return;
            }
            SendUnicodeText(message.Text);
            return;
        }

        if (message.Type == "keyRepeat")
        {
            if ((GetForegroundWindow() != hwnd && !ActivateWindow(hwnd)) ||
                GetForegroundWindow() != hwnd)
            {
                PublishInputState("focus-denied");
                return;
            }
            SendRepeatedEditKey(message);
            return;
        }

        if (message.Type == "key")
        {
            if ((GetForegroundWindow() != hwnd && !ActivateWindow(hwnd)) ||
                GetForegroundWindow() != hwnd)
            {
                PublishInputState("focus-denied");
                return;
            }
            SendRestrictedKey(message);
        }
    }

    // PrintWindow may show application pixels hidden below the taskbar,
    // Start, Task View or another window. Native mouse input is global.
    private static bool IsPointOnCapturedWindow(IntPtr hwnd, int x, int y)
    {
        POINT point = new POINT();
        point.X = x;
        point.Y = y;
        IntPtr hit = WindowFromPoint(point);
        if (hit == IntPtr.Zero) return false;
        return GetAncestor(hit, GA_ROOT) == hwnd && IsOwnedWindow(hwnd);
    }

    private static bool IsOwnedWindow(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero) return false;
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        return IsOwnedProcess(pid);
    }

    private static bool ActivateWindow(IntPtr hwnd)
    {
        if (!IsOwnedWindow(hwnd)) return false;
        uint currentThread = GetCurrentThreadId();
        uint targetThread = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
        IntPtr foreground = GetForegroundWindow();
        uint foregroundThread = foreground == IntPtr.Zero
            ? 0
            : GetWindowThreadProcessId(foreground, IntPtr.Zero);

        bool attachedTarget = targetThread != 0 && targetThread != currentThread &&
            AttachThreadInput(currentThread, targetThread, true);
        bool attachedForeground = foregroundThread != 0 &&
            foregroundThread != currentThread &&
            foregroundThread != targetThread &&
            AttachThreadInput(currentThread, foregroundThread, true);
        try
        {
            ShowWindow(hwnd, SW_RESTORE);
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
            SetFocus(hwnd);
        }
        finally
        {
            if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
            if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
        }

        return GetForegroundWindow() == hwnd;
    }

    private static double Clamp01(double value)
    {
        if (Double.IsNaN(value) || Double.IsInfinity(value)) return 0;
        return Math.Max(0, Math.Min(1, value));
    }

    private static void MoveAbsolute(int x, int y)
    {
        int left = GetSystemMetrics(SM_XVIRTUALSCREEN);
        int top = GetSystemMetrics(SM_YVIRTUALSCREEN);
        int width = Math.Max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
        int height = Math.Max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));
        int normalizedX = (int)Math.Round((x - left) * 65535.0 / Math.Max(1, width - 1));
        int normalizedY = (int)Math.Round((y - top) * 65535.0 / Math.Max(1, height - 1));
        INPUT input = MouseInput(
            normalizedX,
            normalizedY,
            0,
            MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK);
        SendInputs(new INPUT[] { input });
    }

    private static void ApplyPointerAction(string action, int button)
    {
        if (action != "down" && action != "up") return;
        uint flags;
        if (button == 1)
        {
            flags = action == "down" ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
        }
        else if (button == 2)
        {
            flags = action == "down" ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
        }
        else
        {
            flags = action == "down" ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
        }
        SendInputs(new INPUT[] { MouseInput(0, 0, 0, flags) });
    }

    private static void SendWheel(double deltaX, double deltaY)
    {
        List<INPUT> inputs = new List<INPUT>();
        int vertical = ClampWheel(-deltaY);
        int horizontal = ClampWheel(deltaX);
        if (vertical != 0)
        {
            inputs.Add(MouseInput(0, 0, unchecked((uint)vertical), MOUSEEVENTF_WHEEL));
        }
        if (horizontal != 0)
        {
            inputs.Add(MouseInput(0, 0, unchecked((uint)horizontal), MOUSEEVENTF_HWHEEL));
        }
        if (inputs.Count > 0) SendInputs(inputs.ToArray());
    }

    private static int ClampWheel(double value)
    {
        if (Double.IsNaN(value) || Double.IsInfinity(value)) return 0;
        double scaled = Math.Max(-960, Math.Min(960, value * 2));
        return (int)Math.Round(scaled);
    }

    private static void SendUnicodeText(string text)
    {
        if (String.IsNullOrEmpty(text) || text.Length > 16384) return;
        List<INPUT> inputs = new List<INPUT>(text.Length * 2);
        foreach (char character in text)
        {
            inputs.Add(UnicodeInput(character, false));
            inputs.Add(UnicodeInput(character, true));
        }
        SendInputs(inputs.ToArray());
    }

    // All repeat requests are validated in the typed browser protocol and
    // revalidated at the native trust boundary. One SendInput call preserves
    // down/up ordering without repeatedly activating or refocusing the HWND.
    private static void SendRepeatedEditKey(ControlMessage message)
    {
        if (message.Count < 1 || message.Count > 32) return;
        ushort vk;
        if (String.Equals(message.Key, "Backspace", StringComparison.Ordinal)) vk = 0x08;
        else if (String.Equals(message.Key, "Delete", StringComparison.Ordinal)) vk = 0x2e;
        else return;
        List<INPUT> inputs = new List<INPUT>(message.Count * 2);
        for (int i = 0; i < message.Count; i++)
        {
            inputs.Add(VirtualKeyInput(vk, false));
            inputs.Add(VirtualKeyInput(vk, true));
        }
        SendInputs(inputs.ToArray());
    }

    private static void SendRestrictedKey(ControlMessage message)
    {
        if (message.Meta) return;
        string key = message.Key ?? "";
        if (
            (message.Alt && (
                String.Equals(key, "Tab", StringComparison.OrdinalIgnoreCase) ||
                String.Equals(key, "Escape", StringComparison.OrdinalIgnoreCase))) ||
            (message.Ctrl && String.Equals(key, "Escape", StringComparison.OrdinalIgnoreCase)) ||
            (message.Ctrl && message.Alt))
        {
            return;
        }

        ushort vk;
        if (!TryMapVirtualKey(key, out vk)) return;
        bool keyUp = String.Equals(message.Action, "up", StringComparison.Ordinal);
        if (!keyUp && !String.Equals(message.Action, "down", StringComparison.Ordinal)) return;

        List<INPUT> inputs = new List<INPUT>();
        if (!keyUp)
        {
            if (message.Ctrl) inputs.Add(VirtualKeyInput(0x11, false));
            if (message.Alt) inputs.Add(VirtualKeyInput(0x12, false));
            if (message.Shift) inputs.Add(VirtualKeyInput(0x10, false));
            inputs.Add(VirtualKeyInput(vk, false));
        }
        else
        {
            inputs.Add(VirtualKeyInput(vk, true));
            if (message.Shift) inputs.Add(VirtualKeyInput(0x10, true));
            if (message.Alt) inputs.Add(VirtualKeyInput(0x12, true));
            if (message.Ctrl) inputs.Add(VirtualKeyInput(0x11, true));
        }
        SendInputs(inputs.ToArray());
    }

    private static bool TryMapVirtualKey(string key, out ushort vk)
    {
        vk = 0;
        if (String.IsNullOrEmpty(key)) return false;
        if (key.Length == 1)
        {
            char c = Char.ToUpperInvariant(key[0]);
            if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))
            {
                vk = c;
                return true;
            }
        }

        Dictionary<string, ushort> keys = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase)
        {
            { "Enter", 0x0D },
            { "Tab", 0x09 },
            { "Escape", 0x1B },
            { "Backspace", 0x08 },
            { "Delete", 0x2E },
            { "ArrowLeft", 0x25 },
            { "ArrowUp", 0x26 },
            { "ArrowRight", 0x27 },
            { "ArrowDown", 0x28 },
            { "Home", 0x24 },
            { "End", 0x23 },
            { "PageUp", 0x21 },
            { "PageDown", 0x22 },
            { "F1", 0x70 },
            { "F2", 0x71 },
            { "F3", 0x72 },
            { "F4", 0x73 },
            { "F5", 0x74 },
            { "F6", 0x75 },
            { "F7", 0x76 },
            { "F8", 0x77 },
            { "F9", 0x78 },
            { "F10", 0x79 },
            { "F11", 0x7A },
            { "F12", 0x7B }
        };
        return keys.TryGetValue(key, out vk);
    }

    private static INPUT MouseInput(int dx, int dy, uint data, uint flags)
    {
        INPUT input = new INPUT();
        input.type = INPUT_MOUSE;
        input.U.mi = new MOUSEINPUT();
        input.U.mi.dx = dx;
        input.U.mi.dy = dy;
        input.U.mi.mouseData = data;
        input.U.mi.dwFlags = flags;
        return input;
    }

    private static INPUT VirtualKeyInput(ushort vk, bool up)
    {
        INPUT input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.U.ki = new KEYBDINPUT();
        input.U.ki.wVk = vk;
        input.U.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
        return input;
    }

    private static INPUT UnicodeInput(char character, bool up)
    {
        INPUT input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.U.ki = new KEYBDINPUT();
        input.U.ki.wScan = character;
        input.U.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0);
        return input;
    }

    private static void SendInputs(INPUT[] inputs)
    {
        if (inputs == null || inputs.Length == 0 || inputs.Length > 32768) return;
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        PublishInputState(sent == inputs.Length ? "ready" : "input-rejected");
        if (sent != inputs.Length)
        {
            int error = Marshal.GetLastWin32Error();
            if (error != 0)
            {
                // UIPI intentionally prevents lower-integrity PalmTTY from
                // injecting into an elevated application. Do not bypass it.
            }
        }
    }

    private static void ThrowLastError(string operation)
    {
        throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }
}
