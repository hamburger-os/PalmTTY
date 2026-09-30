<!-- bilingual -->
# Remote Apps / 远程 App

## English

PalmTTY Remote Apps let a phone control a **single desktop application launched by PalmTTY** on a Windows host. Remote Apps are a separate activity type from terminal sessions; they do not turn the terminal protocol into a remote-desktop protocol.

### Current support

The first implementation targets Windows x64 Host workspaces. Configure one or more Remote App profiles in the Workspace editor. A profile contains a name, executable, optional argv values, frame rate, and maximum capture dimensions.

The browser starts an App Session by saved profile ID. It cannot supply a one-off executable, PID, window handle, or arbitrary command at launch time.

Examples of intended workloads include Codex Desktop, VS Code, or another current-user development application. A profile being launchable does not imply that the application's rendering has been validated; real Windows/mobile testing remains required.

### Mobile controls

The App surface exposes three explicit pointer modes:

- **View**: sends no pointer input. Browser scrolling and pinch zoom remain local.
- **Touch**: maps touches directly into the captured application window.
- **Trackpad**: one finger moves the remote pointer, a tap clicks, and two fingers scroll.

A special-key strip provides Ctrl/Alt/Shift and common navigation keys. The text panel is intended for mobile IME, paste, and dictation; it sends bounded Unicode text rather than trying to emulate every mobile keyboard event as a desktop key.

### Security model

PalmTTY launches the configured application under the same normal OS user as the Agent. The Windows helper owns the launched process tree in a Job Object and only accepts a visible top-level window owned by that tree as its capture/input target.

The current implementation deliberately does **not** provide full-desktop or monitor capture, browser-selected windows/PIDs, UAC/elevated application control, clipboard/audio/microphone/camera/file-drag channels, or arbitrary keyboard/input command execution.

Windows UIPI remains in force. PalmTTY does not elevate or bypass it.

Video uses WebRTC. Input uses a bounded typed WebRTC DataChannel. Lifecycle/signaling remains authenticated + exact-Origin HTTP through the PalmTTY Agent.

### Persistence

An App Session is owned by a detached AppWorker with a separate authenticated local IPC generation (app-runtime-v1). Restarting the Agent does not intentionally terminate an adopted App Session. If the AppWorker/control pipe itself is lost, the Windows helper terminates its Job Object so the PalmTTY-launched app does not become an unmanaged orphan.

OS reboot, user logoff, and AppWorker death are not recoverable App Session persistence boundaries.

### Capture compatibility

The current conservative Windows capture backend uses window-only PrintWindow(PW_RENDERFULLCONTENT) and never falls back to copying the desktop. Some GPU-accelerated or protected windows may not produce usable frames. That is treated as an unsupported/validation gap instead of widening capture authority.

## 中文

PalmTTY Remote Apps 允许手机控制 **由 PalmTTY 在 Windows 宿主机上启动的单个桌面应用**。它是与终端 Session 并列的 Activity，不会把终端协议扩成远程桌面协议。

### 当前支持范围

第一版只支持 Windows x64 Host Workspace。可以在工作区编辑器中保存一个或多个 Remote App Profile，包括名称、可执行文件、可选独立 argv、帧率与最大画面尺寸。

手机启动 App Session 时只提交已保存的 Profile ID，不能临时指定 executable、PID、窗口句柄或任意命令。

预期工作负载包括 Codex Desktop、VS Code 等当前用户开发应用。能成功启动 Profile 不代表该应用的画面捕获/输入已经通过实机兼容性验证，仍需要真实 Windows + 手机测试。

### 手机操作

App 画面有三种显式模式：

- **查看**：不发送指针输入，页面滚动和双指缩放仍由手机浏览器处理；
- **直触**：触摸位置直接映射到远端应用窗口；
- **触控板**：单指移动远端光标、轻点点击、双指滚动。

底部特殊键栏提供 Ctrl/Alt/Shift 和常用导航键。文本面板用于手机 IME、粘贴和语音输入，发送的是有界 Unicode 文本，不把所有手机键盘事件强行模拟成桌面 keydown。

### 安全模型

Remote App 与 Agent 使用同一个普通 OS 用户。Windows helper 把 PalmTTY 启动的应用进程树放入自己的 Job Object，并且只把该进程树拥有的可见顶层窗口作为画面和输入目标。

当前明确不提供整桌面/显示器捕获、浏览器选择任意窗口/PID、UAC/elevated 应用控制、clipboard/音频/麦克风/摄像头/文件拖放通道，也不提供任意键盘/输入命令执行。

Windows UIPI 保持有效，PalmTTY 不提权也不绕过它。

视频使用 WebRTC；输入使用 typed、有大小上限的 WebRTC DataChannel；生命周期与 signaling 仍经过 PalmTTY Agent 的认证 + 精确 Origin HTTP API。

### 持久化

每个 App Session 由 detached AppWorker 持有，并使用独立的 app-runtime-v1 authenticated local IPC。Agent 重启不会主动终止已经 adoption 的 App Session。若 AppWorker/控制管道本身丢失，Windows helper 会终止其 Job Object，避免 PalmTTY 启动的应用变成无人管理的孤儿进程。

OS reboot、用户注销以及 AppWorker 自身死亡不属于可恢复边界。

### 捕获兼容性

当前保守的 Windows 捕获后端只使用窗口级 PrintWindow(PW_RENDERFULLCONTENT)，不会失败后退化成桌面复制。部分 GPU 加速或受保护窗口可能无法得到有效画面；这种情况视为当前未支持/未验证，而不是扩大捕获权限。
