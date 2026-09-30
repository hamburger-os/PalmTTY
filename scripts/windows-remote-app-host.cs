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
    private const uint INFINITE = 0xFFFFFFFF;
    private const uint WAIT_OBJECT_0 = 0x00000000;
    private const uint RESUME_FAILED = 0xFFFFFFFF;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
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

    [DataContract]
    private sealed class AppConfig
    {
        [DataMember(Name = "executable", IsRequired = true)]
        public string Executable;

        [DataMember(Name = "cwd", IsRequired = true)]
        public string Cwd;

        [DataMember(Name = "args", IsRequired = true)]
        public string[] Args;

        [DataMember(Name = "frameRate", IsRequired = true)]
        public int FrameRate;

        [DataMember(Name = "maxWidth", IsRequired = true)]
        public int MaxWidth;

        [DataMember(Name = "maxHeight", IsRequired = true)]
        public int MaxHeight;
    }

    [DataContract]
    private sealed class ControlMessage
    {
        [DataMember(Name = "type")]
        public string Type;

        [DataMember(Name = "action")]
        public string Action;

        [DataMember(Name = "x")]
        public double X;

        [DataMember(Name = "y")]
        public double Y;

        [DataMember(Name = "dx")]
        public double Dx;

        [DataMember(Name = "dy")]
        public double Dy;

        [DataMember(Name = "button")]
        public int Button;

        [DataMember(Name = "deltaX")]
        public double DeltaX;

        [DataMember(Name = "deltaY")]
        public double DeltaY;

        [DataMember(Name = "key")]
        public string Key;

        [DataMember(Name = "code")]
        public string Code;

        [DataMember(Name = "ctrl")]
        public bool Ctrl;

        [DataMember(Name = "alt")]
        public bool Alt;

        [DataMember(Name = "shift")]
        public bool Shift;

        [DataMember(Name = "meta")]
        public bool Meta;

        [DataMember(Name = "text")]
        public string Text;
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
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(
        uint nInputs,
        [In] INPUT[] pInputs,
        int cbSize);

    private static readonly object TargetLock = new object();
    private static readonly object OutputLock = new object();
    private static IntPtr JobHandle = IntPtr.Zero;
    private static IntPtr TargetWindow = IntPtr.Zero;
    private static RECT TargetRect;
    private static uint RootPid;
    private static volatile bool Stopping;
    private static BinaryWriter Output;
    private static StreamWriter ErrorOutput;

    [STAThread]
    private static int Main()
    {
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        IntPtr job = IntPtr.Zero;
        try
        {
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
            AppConfig config = ParseJson<AppConfig>(firstLine);
            ValidateConfig(config);

            job = CreateConfiguredJob();
            JobHandle = job;
            process = StartApplicationSuspended(config);
            RootPid = process.dwProcessId;
            if (!AssignProcessToJobObject(job, process.hProcess))
            {
                ThrowLastError("AssignProcessToJobObject");
            }
            if (ResumeThread(process.hThread) == RESUME_FAILED)
            {
                ThrowLastError("ResumeThread");
            }
            CloseHandle(process.hThread);
            process.hThread = IntPtr.Zero;

            ErrorOutput.WriteLine("PALMTTY_APP_HOST_READY " + RootPid.ToString());

            Thread control = new Thread(delegate() { ControlLoop(input); });
            control.IsBackground = true;
            control.Name = "PalmTTY Remote App input";
            control.Start();

            Thread capture = new Thread(delegate() { CaptureLoop(config); });
            capture.IsBackground = true;
            capture.Name = "PalmTTY Remote App capture";
            capture.Start();

            uint exitCode = WaitForJobExit(job, process.hProcess);
            Stopping = true;
            capture.Join(1000);
            return unchecked((int)exitCode);
        }
        catch (Exception error)
        {
            try
            {
                if (ErrorOutput != null) ErrorOutput.WriteLine("PALMTTY_APP_HOST_ERROR " + error.Message);
            }
            catch { }
            return 1;
        }
        finally
        {
            Stopping = true;
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
        if (String.IsNullOrWhiteSpace(config.Executable) || !File.Exists(config.Executable))
        {
            throw new FileNotFoundException("Remote App executable does not exist", config.Executable);
        }
        if (String.IsNullOrWhiteSpace(config.Cwd) || !Directory.Exists(config.Cwd))
        {
            throw new DirectoryNotFoundException("Remote App working directory does not exist: " + config.Cwd);
        }
        if (config.Args == null || config.Args.Length > 32) throw new InvalidDataException("Remote App args are invalid");
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
        if (value.Length == 0) return """";
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
        int delay = Math.Max(33, 1000 / config.FrameRate);
        while (!Stopping)
        {
            try
            {
                IntPtr hwnd;
                RECT rect;
                if (TryResolveOwnedWindow(out hwnd, out rect))
                {
                    CaptureWindow(hwnd, rect, config.MaxWidth, config.MaxHeight);
                }
            }
            catch
            {
                // A temporary capture failure must not terminate the app.
            }
            Thread.Sleep(delay);
        }
    }

    private static bool TryResolveOwnedWindow(out IntPtr hwnd, out RECT rect)
    {
        IntPtr best = IntPtr.Zero;
        RECT bestRect = new RECT();
        long bestArea = 0;

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
            if (bounds.Width < 64 || bounds.Height < 64 || area <= bestArea) return true;
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

    private static void CaptureWindow(IntPtr hwnd, RECT rect, int maxWidth, int maxHeight)
    {
        int sourceWidth = rect.Width;
        int sourceHeight = rect.Height;
        if (sourceWidth <= 0 || sourceHeight <= 0 || sourceWidth > 8192 || sourceHeight > 8192) return;

        using (Bitmap source = new Bitmap(sourceWidth, sourceHeight, PixelFormat.Format32bppArgb))
        {
            using (Graphics graphics = Graphics.FromImage(source))
            {
                IntPtr hdc = graphics.GetHdc();
                bool ok;
                try
                {
                    ok = PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT);
                }
                finally
                {
                    graphics.ReleaseHdc(hdc);
                }
                if (!ok) return;
            }

            double scale = Math.Min(
                1.0,
                Math.Min((double)maxWidth / sourceWidth, (double)maxHeight / sourceHeight));
            int width = Math.Max(2, (int)Math.Round(sourceWidth * scale));
            int height = Math.Max(2, (int)Math.Round(sourceHeight * scale));
            width &= ~1;
            height &= ~1;

            if (width == sourceWidth && height == sourceHeight)
            {
                WriteBitmap(source);
                return;
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
                WriteBitmap(scaled);
            }
        }
    }

    private static void WriteBitmap(Bitmap bitmap)
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
            if (payloadBytes > 32 * 1024 * 1024) return;
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
        }
        finally
        {
            bitmap.UnlockBits(data);
        }
    }

    private static void HandleControl(ControlMessage message)
    {
        if (message == null || String.IsNullOrWhiteSpace(message.Type)) return;
        IntPtr hwnd;
        RECT rect;
        lock (TargetLock)
        {
            hwnd = TargetWindow;
            rect = TargetRect;
        }
        if (hwnd == IntPtr.Zero || !IsOwnedWindow(hwnd)) return;

        if (message.Type == "pointer")
        {
            if (!ActivateWindow(hwnd)) return;
            int x = rect.Left + (int)Math.Round(Clamp01(message.X) * Math.Max(1, rect.Width - 1));
            int y = rect.Top + (int)Math.Round(Clamp01(message.Y) * Math.Max(1, rect.Height - 1));
            MoveAbsolute(x, y);
            ApplyPointerAction(message.Action, message.Button);
            return;
        }

        if (message.Type == "pointerRelative")
        {
            if (!ActivateWindow(hwnd)) return;
            POINT point;
            if (!GetCursorPos(out point)) return;
            int x = Math.Max(rect.Left, Math.Min(rect.Right - 1, point.X + (int)Math.Round(message.Dx * rect.Width)));
            int y = Math.Max(rect.Top, Math.Min(rect.Bottom - 1, point.Y + (int)Math.Round(message.Dy * rect.Height)));
            MoveAbsolute(x, y);
            ApplyPointerAction(message.Action, message.Button);
            return;
        }

        if (message.Type == "wheel")
        {
            if (!ActivateWindow(hwnd)) return;
            SendWheel(message.DeltaX, message.DeltaY);
            return;
        }

        if (message.Type == "text")
        {
            if (!ActivateWindow(hwnd)) return;
            SendUnicodeText(message.Text);
            return;
        }

        if (message.Type == "key")
        {
            if (!ActivateWindow(hwnd)) return;
            SendRestrictedKey(message);
        }
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

        IntPtr active = GetForegroundWindow();
        return active == hwnd || IsOwnedWindow(active);
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

    private static void SendRestrictedKey(ControlMessage message)
    {
        if (message.Meta) return;
        string key = message.Key ?? "";
        if (message.Alt && String.Equals(key, "Tab", StringComparison.OrdinalIgnoreCase)) return;

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
