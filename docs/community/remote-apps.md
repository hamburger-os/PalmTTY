<!-- bilingual -->
# Remote Apps / 远程 App

## English

PalmTTY Remote Apps let a phone operate a **single desktop application launched by PalmTTY** on a Windows host. Remote Apps are a separate Activity type from Terminal Sessions. They do not extend the PTY/xterm protocol into a remote-desktop protocol.

### Configure an app

Workspace editing is intentionally split into separate surfaces:

- **Workspace** owns name, working directory and bounded environment values.
- **Terminal** owns the Terminal runtime/profile and optional startup command.
- **Remote Apps** owns saved application profiles.

A Remote App profile now contains only an ID, display name, executable and optional argv. Capture FPS and pixel dimensions are not user settings. PalmTTY adapts the bounded capture size from the live Remote App surface on the phone.

The normal flow is **Add application → choose a detected app or browse for an .exe → optionally add argv → save**. Discovery is bounded: PalmTTY checks a small known set of developer apps and its executable browser exposes only directories and `.exe` files. A manual executable path remains an Advanced fallback.

An App Session is created only by persisted `workspaceId + profileId`. The browser cannot provide an arbitrary executable, PID, HWND, environment override or capture target when starting a session.

Remote Apps are Windows-host activities even when the Workspace Terminal uses WSL. Terminal/Git/Files may use the persisted WSL runtime while a Remote App still launches as the current Windows user.

### Mobile controls and automatic presentation

The App surface exposes three explicit pointer modes:

- **View**: sends no pointer input. Browser gestures stay local.
- **Touch**: maps touches into the captured application window.
- **Trackpad**: one finger moves the remote pointer, tap clicks, and two fingers scroll.

The special-key strip provides Ctrl/Alt/Shift and common navigation keys. The text panel sends bounded Unicode text for mobile IME, paste and dictation.

Presentation is automatic. The browser sends a bounded display-size hint when the App surface changes size or orientation; the Windows helper scales capture within PalmTTY hard limits. The toolbar reports **Quality · Auto** rather than exposing FPS/width/height controls.

The Workbench can switch among live Activities for the same Workspace without returning to the home page, while Git/Files remain shared Workspace tools.

### Connection and capture diagnostics

PalmTTY distinguishes these states instead of showing an unexplained black surface:

- waiting for the PalmTTY-owned application window;
- window found, waiting for a capturable frame;
- streaming;
- capture unavailable;
- WebRTC path unavailable.

The capture boundary remains fail-closed. The current Windows helper uses window-only `PrintWindow(PW_RENDERFULLCONTENT)` and never falls back to desktop/monitor capture. GPU-accelerated or protected windows may therefore remain unsupported until a safer single-window backend is implemented.

### WebRTC on LAN, VPN and public ingress

WebRTC signaling still goes through the authenticated + exact-Origin PalmTTY Agent. Direct LAN/VPN routing may work with host candidates only. For reverse-proxy or public deployments, configure `remoteApps.webrtc.iceServers` with STUN/TURN as needed. PalmTTY exposes the configured ICE servers only to authenticated Remote App clients and reports whether a TURN relay is configured.

PalmTTY does not provide or operate a cloud relay service. TURN credentials are host configuration and should be treated as sensitive deployment data.

### Security and lifecycle

PalmTTY launches the configured app as the same normal OS user as the Agent. The Windows helper places the launched process tree in a PalmTTY-owned Job Object and only accepts a visible top-level window whose process remains in that Job as its capture/input target.

PalmTTY deliberately does **not** provide full-desktop capture, browser-selected windows/PIDs, UAC/elevated control, clipboard/audio/microphone/camera/file-drag channels, or arbitrary keyboard/input commands. Windows UIPI remains a security boundary.

Each App Session is owned by a detached AppWorker with an authenticated local IPC generation separate from Terminal Workers. Agent restart does not intentionally terminate an adopted App Session. OS reboot, user logoff and AppWorker death are not recoverable persistence boundaries. If AppWorker/helper control is lost, the Job Object is closed so the PalmTTY-launched process tree does not become an unmanaged orphan.

## 中文

PalmTTY Remote Apps 允许手机操作 **由 PalmTTY 在 Windows 宿主机上启动的单个桌面应用**。它和 Terminal Session 是并列的 Activity，不会把 PTY/xterm 协议扩成远程桌面协议。

### 配置 App

工作区编辑现在明确拆成三个配置面：

- **Workspace**：名称、工作目录、有界环境变量；
- **Terminal**：终端运行环境/Profile 与可选启动命令；
- **Remote Apps**：持久化应用 Profile。

Remote App Profile 只包含 ID、显示名称、可执行文件和可选 argv。FPS、最大宽高不再属于用户配置；手机端 Remote App Surface 会根据实际可视尺寸自动请求有界捕获尺寸。

正常流程是：**添加应用 → 选择检测到的 App 或浏览 .exe → 可选填写 argv → 保存**。应用检测是有界能力：PalmTTY 只检查少量已知开发应用；可执行文件浏览器只暴露目录和 `.exe`。手动路径仍保留在“高级”中作为兜底。

创建 App Session 时浏览器仍只能提交持久化的 `workspaceId + profileId`，不能临时提交 executable、PID、HWND、环境覆盖或捕获目标。

Remote App 是 Windows 宿主 Activity，即使 Workspace 的 Terminal 使用 WSL 也可以独立存在。Terminal/Git/Files 可以继续使用持久化 WSL runtime，而 Remote App 仍以当前 Windows 普通用户启动。

### 手机操作与自动画面

App 画面提供三种显式模式：

- **查看**：不发送指针输入，浏览器手势留在本地；
- **直触**：触摸坐标映射到远端应用窗口；
- **触控板**：单指移动光标、轻点点击、双指滚动。

特殊键栏提供 Ctrl/Alt/Shift 和常用导航键；文本面板使用有界 Unicode 文本通道，适合手机 IME、粘贴和语音输入。

画面策略自动适配。手机 Surface 尺寸或横竖屏变化时，浏览器发送有界 display hint，Windows helper 在 PalmTTY 硬上限内缩放捕获；UI 只显示“**画质 · 自动**”，不再让用户手工配置 FPS/宽高。

同一 Workspace 的多个活动可以直接在 Workbench 中切换，无需返回首页；Git/Files 仍是共享 Workspace Tool。

### 连接与捕获诊断

PalmTTY 会区分以下状态，而不是只显示无法解释的黑屏：

- 等待 PalmTTY 持有的应用窗口；
- 已找到窗口，等待第一帧；
- 正在串流；
- 当前窗口无法捕获；
- WebRTC 媒体通道无法建立。

捕获边界继续 fail closed。当前 Windows helper 只使用窗口级 `PrintWindow(PW_RENDERFULLCONTENT)`，不会失败后退化为整桌面/显示器捕获。因此 GPU 加速或受保护窗口仍可能不兼容，直到未来引入同样保持“单个受权窗口”边界的更安全 backend。

### LAN、VPN 与公网 WebRTC

WebRTC signaling 仍经过 PalmTTY Agent 的认证 + 精确 Origin。LAN/VPN 中如果 host candidate 可直接路由，可以不配置额外 ICE 服务；反向代理或公网部署可按需在 `remoteApps.webrtc.iceServers` 配置 STUN/TURN。只有已认证的 Remote App 客户端能拿到这些 ICE 配置，能力接口还会指出是否配置了 TURN relay。

PalmTTY 本身不提供云中继服务。TURN 凭据属于宿主部署配置，应按敏感部署数据处理。

### 安全与生命周期

Remote App 与 Agent 使用同一个普通 OS 用户。Windows helper 把 PalmTTY 启动的进程树放进自己持有的 Job Object，只把仍属于该 Job 的进程拥有的可见顶层窗口作为捕获/输入目标。

PalmTTY 明确不提供整桌面捕获、浏览器选择任意窗口/PID、UAC/elevated 控制、clipboard/音频/麦克风/摄像头/文件拖放或任意键盘/输入命令。Windows UIPI 继续作为安全边界。

每个 App Session 由独立 detached AppWorker 持有，并使用与 Terminal Worker 分离的 authenticated local IPC generation。Agent 重启不会主动终止已经 adopt 的 App Session；OS reboot、用户注销和 AppWorker 自身死亡不属于可恢复边界。如果 AppWorker/helper 控制链路丢失，Job Object 会关闭，避免 PalmTTY 启动的应用树变成无人管理的孤儿进程。
