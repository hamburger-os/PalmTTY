<!-- bilingual -->
# Remote Apps / 远程 App

## English

PalmTTY Remote Apps let a phone operate a **single desktop application launched by PalmTTY** on a Windows host. Remote Apps are a separate Activity type from Terminal Sessions. They do not extend the PTY/xterm protocol into a remote-desktop protocol.

### Configure an app

Workspace editing is intentionally split into separate surfaces:

- **Workspace** owns name, working directory and bounded environment values.
- **Terminal** owns the Terminal runtime/profile and optional startup command.
- **Remote Apps** owns saved application profiles.

A Remote App profile contains an ID, display name, typed Win32 executable or registered MSIX AUMID/package-family launch identity, and optional argv. Capture FPS and pixel dimensions are not user settings. PalmTTY adapts the bounded capture size from the live Remote App surface on the phone.

The normal flow is **Add application → choose a detected Win32/Store app or browse for an .exe → optionally add argv → save**. Discovery is bounded: PalmTTY prioritizes Get-StartApps entries verified against current-user MSIX package registrations, then checks known PATH entries, installation roots, App Paths and capped Start Menu shortcuts. The detected catalog is searchable and limited to 64 applications; the separate executable browser exposes only directories and `.exe` files. A manual executable path remains an Advanced fallback.

This breaking pre-release launch schema uses `workspaces-v3.json`; old v1/v2 files stay untouched but Workspace profiles must be recreated. An App Session is created only by persisted `workspaceId + profileId`. The browser cannot provide an arbitrary executable, PID, HWND, environment override or capture target when starting a session.

Remote Apps are Windows-host activities even when the Workspace Terminal uses WSL. Terminal/Git/Files may use the persisted WSL runtime while a Remote App still launches as the current Windows user.

### Mobile controls and automatic presentation

The App surface exposes three explicit pointer modes:

- **View**: sends no pointer input. Browser gestures stay local.
- **Touch**: maps touches into the captured application window.
- **Trackpad**: the visible, verified Windows pointer follows one-finger movement; tap clicks, long press drags, two-finger tap right-clicks, and two-finger movement scrolls.

The bottom dock shares the Terminal dock’s first two actions: **Keyboard**, **Long Text**, followed by Ctrl/Alt/Shift and navigation. Keyboard synchronously focuses a 1px nearly invisible but genuine in-viewport Safari input with a 16px computed font, not a second editor over the captured app. Committed Unicode uses an ordered, bounded per-frame text queue; Backspace/Delete are batched (max 32 per native event); supported navigation retains the typed key allowlist. Long Text remains explicitly sent and supports paste, IME and dictation. Display options contain neither input action.

Presentation is automatic. The browser sends a bounded display-size hint when the App surface changes size or orientation; the Windows helper scales capture within PalmTTY hard limits. The toolbar reports **Quality · Auto** rather than exposing FPS/width/height controls.

The Workbench can switch among live Activities for the same Workspace without returning to the home page, while Git/Files remain shared Workspace tools.

### Portrait-first Remote App presentation

Remote Apps prioritize unobstructed video. On phones the Workbench header fits one line and Git/Files live behind Tools. Pointer modes, the persistent immersive toggle/exit and the options menu now sit in a compact strip **below** the video, immediately above the special-key dock; media diagnostics open from that menu instead of covering application menus. Immersive mode hides the header and removes its grid row, while keeping the exit button reachable below the video. The dock remains inside the current VisualViewport above mobile browser chrome, with navigation keys expanded on demand.

View mode preserves browser pinch. Direct Touch and Trackpad modes claim only gestures beginning inside the active remote surface, using a bounded gesture state machine for single-finger move/tap and two-finger centroid scroll. A cancelled or partially lifted gesture never generates a phantom click. The helper sends only normalized coordinates inside the verified owned window (hidden outside), and AppWorker forwards typed cursor and native input-state events through the existing single-peer WebRTC DataChannel; streaming video does not imply remote input is available. Video defaults to complete-window contain. Explicit phone adaptation resizes the verified application window and automatically fills only small remaining aspect/codec rounding gaps (at most 4% of an edge); a genuinely constrained window stays fully visible rather than silently cropping controls. Direct Touch and cursor use the exact same effective video rectangle and fit geometry.

The optional **Resize PC window for phone** switch attempts to resize only the session-owned verified HWND within protocol limits, compensates for bounded invisible DWM resize borders, and attempts to restore its original dimensions when disabled or the helper stops. Some desktop apps enforce a minimum width and cannot become native mobile UIs. Display hints remain presentation state, not an executable/PID/HWND selection channel. Native WebRTC is initialized only after the Windows app reaches READY; on an MSIX launch failure the browser receives the bounded native startup stage, error type and HRESULT instead of a misleading addon teardown code. Fully dark successful captures remain ambiguous: after retrying the same authorized window, PalmTTY forwards the frame with a blank-window diagnostic rather than treating every black theme as failed.

### Updating a source checkout

In source mode, the native Windows Host is cached by the SHA-256 fingerprint of its C# source and compiler settings, not by an unchanged executable filename. Restart the Agent after pulling a source update: the next App Session automatically builds the matching Host while existing detached AppWorkers can continue using their prior binary. Installed distributions always ship their precompiled Host and must be upgraded normally.

### Connection and capture diagnostics

PalmTTY distinguishes these states and exposes received/submitted video-frame counts, conversion failures and browser decoded-frame readiness on demand in the options menu instead of treating an ICE connection as successful video. Initial loading covers only the empty surface; once the browser has decoded a frame, stale worker waiting states cannot recreate the waiting overlay. Subsequent stream interruptions use a non-blocking warning in the dock:

- waiting for the PalmTTY-owned application window;
- window found, waiting for a capturable frame;
- streaming;
- capture unavailable;
- WebRTC path unavailable.

The capture boundary remains fail-closed. The current Windows helper uses window-only `PrintWindow(PW_RENDERFULLCONTENT)` with standard same-window `PrintWindow` retry if the first call fails or returns blank and never falls back to desktop/monitor capture. GPU-accelerated or protected windows may therefore remain unsupported until a safer single-window backend is implemented.

### WebRTC on LAN, VPN and public ingress

WebRTC signaling still goes through the authenticated + exact-Origin PalmTTY Agent. Direct LAN/VPN routing may work with host candidates only. For reverse-proxy or public deployments, configure `remoteApps.webrtc.iceServers` with STUN/TURN as needed. PalmTTY exposes the configured ICE servers only to authenticated Remote App clients and reports whether a TURN relay is configured.

PalmTTY does not provide or operate a cloud relay service. TURN credentials are host configuration and should be treated as sensitive deployment data.

### Security and lifecycle

PalmTTY launches the configured app as the same normal OS user as the Agent. For MSIX, activation requires a registered AUMID, a newly created PID, an exact matching package family and successful Job assignment; a reused singleton or an unassignable process is rejected. The Windows helper places the launched process tree in a PalmTTY-owned Job Object and only accepts a visible top-level window whose process remains in that Job as its capture/input target.

PalmTTY deliberately does **not** provide full-desktop capture, browser-selected windows/PIDs, UAC/elevated control, clipboard/audio/microphone/camera/file-drag channels, or arbitrary keyboard/input commands. Windows UIPI remains a security boundary.

Each App Session is owned by a detached AppWorker with an authenticated local IPC generation separate from Terminal Workers. Agent restart does not intentionally terminate an adopted App Session. OS reboot, user logoff and AppWorker death are not recoverable persistence boundaries. If AppWorker/helper control is lost, the Job Object is closed so the PalmTTY-launched process tree does not become an unmanaged orphan.

## 中文

PalmTTY Remote Apps 允许手机操作 **由 PalmTTY 在 Windows 宿主机上启动的单个桌面应用**。它和 Terminal Session 是并列的 Activity，不会把 PTY/xterm 协议扩成远程桌面协议。

### 配置 App

工作区编辑现在明确拆成三个配置面：

- **Workspace**：名称、工作目录、有界环境变量；
- **Terminal**：终端运行环境/Profile 与可选启动命令；
- **Remote Apps**：持久化应用 Profile。

Remote App Profile 只包含 ID、显示名称、Win32 可执行文件或已注册 MSIX 的 AUMID/包家族身份，以及可选 argv。FPS、最大宽高不再属于用户配置；手机端 Remote App Surface 会根据实际可视尺寸自动请求有界捕获尺寸。

正常流程是：**添加应用 → 选择检测到的 Win32/Store 应用或浏览 .exe → 可选填写 argv → 保存**。应用检测是有界能力：PalmTTY 优先读取 Get-StartApps 中与当前用户 Get-AppxPackage 注册信息匹配的 MSIX 应用，再有界检查已知应用、PATH、App Paths 和开始菜单快捷方式；可执行文件浏览器只暴露目录和 `.exe`。手动路径仍保留在“高级”中作为兜底。

新的不兼容启动格式使用 `workspaces-v3.json`，旧 v1/v2 文件保持原样但需要重新创建 Workspace。创建 App Session 时浏览器仍只能提交持久化的 `workspaceId + profileId`，不能临时提交 executable、PID、HWND、环境覆盖或捕获目标。

Remote App 是 Windows 宿主 Activity，即使 Workspace 的 Terminal 使用 WSL 也可以独立存在。Terminal/Git/Files 可以继续使用持久化 WSL runtime，而 Remote App 仍以当前 Windows 普通用户启动。

### 手机操作与自动画面

App 画面提供三种显式模式：

- **查看**：不发送指针输入，浏览器手势留在本地；
- **直触**：触摸坐标映射到远端应用窗口；
- **触控板**：显示 Windows 确认的受控窗口光标；单指移动、轻点左键、长按拖动、双指轻点右键、双指移动滚动。

Remote App 底部与 CLI 一致：**键盘、长文本** 固定为前两项，其后是 Ctrl/Alt/Shift 和导航键。「键盘」在用户点击时聚焦屏幕内 1px 的不可见编辑桥（字号仍为 16px），不会叠加灰色输入框；中文输入法组合完成后才按帧发送有界 Unicode，连续退格/删除每批最多 32 次。特殊导航键沿原有白名单发送。「长文本」保留明确发送的粘贴、IME 和语音输入面板。选项菜单不包含输入入口。

画面策略自动适配。手机 Surface 尺寸或横竖屏变化时，浏览器发送有界 display hint，Windows helper 在 PalmTTY 硬上限内缩放捕获；UI 只显示“**画质 · 自动**”，不再让用户手工配置 FPS/宽高。

同一 Workspace 的多个活动可以直接在 Workbench 中切换，无需返回首页；Git/Files 仍是共享 Workspace Tool。

### 面向手机竖屏的沉浸式交互

远程 App 以不受遮挡的视频画面为核心：手机工作区顶栏压缩为一行，Git/文件位于可展开的“工具”。操作模式切换、沉浸进入/退出及选项菜单统一移到视频下方、快捷键栏上方；媒体诊断按需从选项中展开，不再常驻遮挡应用菜单。沉浸模式同时移除顶栏及其 Grid 行，底部退出按钮始终可见；整组控制栏位于 Safari 当前可视区域内，方向键和删除键按需展开。

查看模式保留浏览器捏合；直触与触控板模式只接管从远程画面内开始的触摸。独立手势状态机区分单指移动/点击、双指中心滚动以及取消/部分抬起，避免误触。原生 Host 仅报告已验证受控窗口内的归一化光标（窗口外隐藏）；AppWorker 经现有已认证的单一 WebRTC DataChannel 转发有类型的光标和原生输入状态。视频已连接不等于远程输入就绪。默认完整等比显示；选择“适应手机”后自动修正受控窗口尺寸，并仅对剩余不超过 4% 的轻微比例误差等比填满，不再提供独立“铺满画面”选项。窗口无法调整时保留完整画面，直触与鼠标始终采用视频实际可见区域的相同坐标映射。

“适应手机（调整电脑窗口）”是唯一的画面适配开关，只对当前 App Session 验证过的 HWND 进行有界调整，计算时补偿 Windows DWM 隐形窗口边框（单方向最多 32 物理像素）；关闭或退出时尝试恢复原尺寸。部分桌面软件限制最小宽度，不能承诺自动生成原生手机布局。MSIX 启动失败显示受限长度的阶段、异常类型和 HRESULT；Windows 应用 READY 之前不加载原生 WebRTC。纯黑帧不能独立证明捕获失败，完成同一合法窗口重试后仍会发送并提示歧义。

### 从源码更新 PalmTTY

源码运行模式的 Windows 原生 Host 以 C# 源码和编译参数的 SHA-256 指纹命名缓存，不再反复使用固定名称的旧 EXE。拉取更新后重启 Agent，下一次创建 App Session 会自动编译对应版本，已有独立 AppWorker 可以继续使用以前启动的 Host。安装包使用内置预编译 Host，需要正常升级安装版本。

### 连接与捕获诊断

PalmTTY 会分别管理捕获状态、Worker 收到/成功提交视频帧计数、转换失败次数和浏览器是否真正显示首帧，而不是仅凭 WebRTC 已连接就宣称画面正常。视频首帧出现后立即取消初始等待覆盖层；后续断流/卡帧使用底部非阻塞提示，详细诊断收纳在选项菜单中：

- 等待 PalmTTY 持有的应用窗口；
- 已找到窗口，等待第一帧；
- 正在串流；
- 当前窗口无法捕获；
- WebRTC 媒体通道无法建立。

捕获边界继续 fail closed。当前 Windows helper 先使用窗口级 `PrintWindow(PW_RENDERFULLCONTENT)`；若失败或返回纯黑空帧，只对同一个已验证 HWND 重试普通 `PrintWindow`，不会失败后退化为整桌面/显示器捕获。因此 GPU 加速或受保护窗口仍可能不兼容，直到未来引入同样保持“单个受权窗口”边界的更安全 backend。

### LAN、VPN 与公网 WebRTC

WebRTC signaling 仍经过 PalmTTY Agent 的认证 + 精确 Origin。LAN/VPN 中如果 host candidate 可直接路由，可以不配置额外 ICE 服务；反向代理或公网部署可按需在 `remoteApps.webrtc.iceServers` 配置 STUN/TURN。只有已认证的 Remote App 客户端能拿到这些 ICE 配置，能力接口还会指出是否配置了 TURN relay。

PalmTTY 本身不提供云中继服务。TURN 凭据属于宿主部署配置，应按敏感部署数据处理。

### 安全与生命周期

Remote App 与 Agent 使用同一个普通 OS 用户。MSIX 必须先通过 AUMID 激活、验证新 PID 和包家族，并成功加入 Job；复用的单实例或 Windows 拒绝加入 Job 的应用会拒绝接管。Windows helper 把 PalmTTY 启动的进程树放进自己持有的 Job Object，只把仍属于该 Job 的进程拥有的可见顶层窗口作为捕获/输入目标。

PalmTTY 明确不提供整桌面捕获、浏览器选择任意窗口/PID、UAC/elevated 控制、clipboard/音频/麦克风/摄像头/文件拖放或任意键盘/输入命令。Windows UIPI 继续作为安全边界。

每个 App Session 由独立 detached AppWorker 持有，并使用与 Terminal Worker 分离的 authenticated local IPC generation。Agent 重启不会主动终止已经 adopt 的 App Session；OS reboot、用户注销和 AppWorker 自身死亡不属于可恢复边界。如果 AppWorker/helper 控制链路丢失，Job Object 会关闭，避免 PalmTTY 启动的应用树变成无人管理的孤儿进程。

### Responsive cursor feedback / 流畅鼠标反馈

The tiny verified-window arrow now occupies about 5.667 × 8 CSS pixels, one third of its former 17 × 24 size. Native Windows cursor sampling runs on an independent ~30 Hz thread instead of waiting for 5–15 fps window-video capture; ownership and visibility are rechecked on every sample. Browser Trackpad movement coalesces relative deltas to at most one WebRTC control message per animation frame and paints a bounded, optimistic local pointer transform without rendering the React tree on every cursor update. When fingers lift, the preview reconciles to the latest authenticated native position; leaving the owned window hides it immediately. This reduces perceived cursor lag, but actual network and Windows input latency still depend on the connection and host workload.

已验证窗口内的 SVG 箭头由 17×24 缩为约 5.667×8 CSS 像素。Windows 光标采样改用独立约 30Hz 线程，不再与 5–15fps 视频截图共用采样时机，每次仍校验窗口归属和可见性。手机触控板将一帧内的位移合并为一条 WebRTC 控制消息，预测光标通过逐帧 DOM transform 绘制而不是每次触发 React 整树渲染；抬起手指后以最新原生位置校准，移出受控窗口立即隐藏。网络与 Windows 真实输入延迟仍受部署环境影响。

### Invisible keyboard and responsive deletion / 隐形键盘和流畅删除

The iPhone still needs a real, in-viewport editable element to open its native keyboard, but it does not need another visible field over the remotely captured application's own input. A nearly invisible 1px editable bridge with 16px computed font and a nonempty sentinel keeps iOS autorepeat working. Confirmed Unicode is serialized into bounded <=2 KiB text messages, and consecutive Backspace/Delete actions into typed batches of at most 32. The Windows host revalidates repeat requests and skips repeated SetFocus/ShowWindow when the verified owned app is already foreground. The explicit Long Text composer preserves text that could not be sent under congestion. This improves input-path latency but does not increase the application's media capture frame rate or guarantee exactly-once delivery after disconnection.

iPhone 唤起软键盘依然需要真实、位于屏幕内的输入元素，但不需要再在远程软件已有输入框上方显示第二个灰色输入框。1px 的隐形桥保留 16px 字号及非空哨兵，支持 iOS 连续删除。已确认文字以最多 2KiB 的消息按序批量发送，连续 Backspace/Delete 每批最多 32 次；Windows 已处于前台的已验证窗口跳过每键重复激活和 SetFocus。拥塞时未发送文字保留给「长文本」。视频自身帧率和中断后的恰好一次交付并未改变。
