<!-- bilingual -->
# Architecture / 架构

## English

PalmTTY is a single-user, self-hosted control plane for interactive development terminals.

~~~text
Mobile browser / PWA
  | Terminal | Git | Files | Artifacts
        |
     HTTPS/WSS
        |
trusted VPN or reverse proxy
        |
PalmTTY Agent (Fastify)
   |           |             |
 auth   workspace catalog   static PWA
              |
       runtime validation
              |
      authenticated local IPC
              |
      per-session Worker
         |           |
      node-pty   headless xterm
         |       seq + replay
         |
 Host shell / WSL shell
         |
 Codex / Git / toolchain
~~~

### Repository components

- apps/agent: HTTP/WebSocket control plane, authentication, security gates, Worker discovery and browser↔Worker proxying.
- apps/web: mobile-first React/xterm Session workbench with Terminal / Git / Files / Artifacts panes. Its visual theme/performance preference and selected pane are browser-local presentation state; they do not enter Agent, Workspace or Session authority.
- packages/protocol: executable browser protocol schemas.
- packages/config: operator YAML schema for server/auth/session policy.
- Agent workspace store: versioned per-user persistent workspace catalog, separate from operator YAML.
- docs: four documentation layers.

### Session ownership

Each Session is owned by one independent detached Worker process. The Worker owns the PTY, headless terminal mirror, monotonically increasing output sequence, bounded replay history and exited-session retention.

Session lifecycle actions are explicit. Termination moves an active Session through `stopping` to `exited` and keeps its retained terminal state available. Restart is a replacement operation: it waits for the old PTY to exit, creates and adopts the replacement Worker, and only then retires the previous retained Session. The replacement gets a new Session ID with the previous geometry; a failed replacement leaves the old exited history available for inspection and retry. Deletion is separate and allowed only for `exited/failed` Sessions; it asks the Worker to retire immediately and release terminal/recovery state. The Agent deliberately does not own a second canonical copy of terminal state or delete Worker recovery files behind the Worker's back.

### Persistence semantics

PalmTTY is:

- browser-disconnect persistent;
- WebSocket-reconnect persistent;
- Agent-restart persistent.

Restarting or replacing only the PalmTTY Agent disconnects browser/control sockets but does not terminate the Worker or PTY. A new Agent rediscovers the Worker using local recovery metadata and an authenticated per-session secret.

PalmTTY is not persistent across OS reboot, user logoff, or Worker-process loss.

Login sessions remain in Agent memory, so after Agent restart the user signs in again before reattaching the surviving terminal.

### Local Worker IPC

On Windows the Agent and Worker communicate through a named pipe. Current non-Windows CI uses Unix domain sockets.

Every Worker has an independent 256-bit secret. The secret is sent to the Worker once through anonymous stdin at creation time and persisted only in the local runtime recovery area; it never reaches the browser. Recovery state is isolated by private Worker IPC generation; the current protocol v5 uses a `runtime-v5` directory and does not rediscover previous-generation runtime state. IPC frames and socket backlog are bounded.

Persisted PIDs are diagnostic metadata only. PalmTTY never treats an old PID as sufficient authority to kill a process. A failed Agent connection is also not proof that a Worker is dead: potentially-live recovery metadata is preserved, and an adopted Worker retries control-plane reconnection instead of converting an IPC outage into PTY loss. Missing Worker-owned recovery files are republished by the Worker; conflicting recovery authority fails closed.

Workspace definitions are persistent Agent-owned state managed through authenticated, exact-Origin-protected HTTP endpoints. WorkspaceWorkbench keeps Terminal transport separate from Workspace/Session tools: switching to Git, Files or Artifacts does not unmount/reconnect xterm, and the Agent exposes dedicated bounded HTTP APIs rather than extending the terminal WebSocket protocol. Session Artifacts are bounded image files in a private per-Session runtime store outside the Workspace: the Agent validates PNG/JPEG/WebP/GIF bytes, dimensions and pixel count, randomizes storage names, uses stable bounded file reads, applies count/file/aggregate limits, and returns a local Host/WSL-readable path from immutable Session launch-runtime metadata. The Web UI can insert that path as terminal text without submitting Enter, so CLI-specific multimodal syntax remains a workload concern rather than a PalmTTY protocol dependency. Artifact directories survive an Agent restart while the corresponding Worker recovery record remains live and are removed with Session retirement or startup orphan cleanup.  Files renders `.md`/`.markdown` locally as sanitized GFM Markdown with a source toggle; relative file links stay inside Workspace authority and remote images never auto-load. Wide Markdown tables preserve native table layout and scroll horizontally inside the single vertically scrolling preview, with a hint and keyboard focus only when columns overflow. 文件视图本地安全渲染 Markdown 并可切换源码，相对链接仍受工作区边界约束，不会自动加载远程图片；宽表保持正常列宽、独立横向滚动，只有发生溢出才提示可左右滑动，正文仍只有一个纵向滚动区。 File listing/preview/complete-file export remains read-only, accepts canonical Workspace-relative paths, enforces canonical/symlink containment within the persisted Workspace root, caps listings at 512 entries and UTF-8 previews at 512 KiB, and reports binary/truncated content explicitly. Complete-file export is a separate 8 MiB-bounded stable read used for copy/share/download, so a truncated preview is never presented as complete content. Git resolves the complete repository containing the persisted Workspace cwd and returns that scope plus the Workspace's repository-relative path. Read APIs use porcelain-v2 status, bounded diff/branch queries, snapshot-stable opaque-cursor history pagination, optional file history, and bounded commit metadata/changed-file/file-diff inspection; root commits use the empty tree and non-root/merge commits use the first parent as one deterministic review baseline, with external diff/textconv/fsmonitor disabled. Write APIs accept only typed stage/unstage/restore/commit/branch/stash/fetch/pull/push operations, require a current repository state token plus explicit trusted-repository acknowledgement, verify the loaded diff snapshot before destructive restore, disable Git hooks and interactive prompts, and never accept arbitrary browser-provided Git argv. Normal Git filters can still execute for operations whose Git semantics require them, so the acknowledgement is a trust boundary rather than a sandbox. Helper subprocesses exclude PalmTTY control/auth environment data and askpass entry points. The Web editor has bounded runtime inspection for directory browsing and unified terminal profiles; Host profiles are limited to known shells, while Windows WSL profiles are discovered by enumerating registered distributions without starting them. Neither surface is a general command API. Workspace definitions may include a bounded environment map and multiline startup input. Session creation/restart do not accept ad-hoc cwd/shell/environment overrides; they resolve persisted workspace authority by ID. On Windows, every new/restarted Host terminal refreshes Machine/User environment variables before resolving PATH and applying workspace overrides. WSL runtimes resolve `wsl.exe`, pass distribution/cwd/shell as structured argv, and forward configured workspace variable names through `WSLENV`. The Worker bootstrap carries only the normalized launch specification. Worker durability begins at an authenticated, idempotent `adopt` commit: a lost adoption response is retried over fresh IPC, while a never-adopted Worker expires its short creation lease and self-cleans.

Browser interaction ownership is explicit as well. xterm remains the only terminal scroll-physics owner; PalmTTY only uses a click/tap focus bridge (plus the mobile keyboard button) to activate xterm's hidden textarea, and editable controls on coarse-pointer/mobile layouts use at least 16px text to avoid iOS focus zoom. WorkspaceWorkbench owns the current VisualViewport presentation frame at every zoom level so browser chrome, pinch zoom and the soft keyboard resize/reposition the whole workbench before terminal FitAddon observes mount geometry; TerminalView does not listen to VisualViewport directly, `visualViewport.scale` never disables framing, and PalmTTY never writes user zoom. `?viewportDebug=1` exposes geometry/focus diagnostics without terminal content. The Git sidebar is one vertical scroll container for its Changes/History content and tools; nested change/history lists are content, not additional scroll owners. Files can deep-link a selected file into file-scoped Git history without changing Workspace or Session authority. The mobile terminal keybar is a browser-side input adapter, not a CLI-specific protocol: a shared pure encoder maps Enter, navigation keys, Ctrl/Alt combinations and fixed control shortcuts to terminal bytes, while the UI places Keyboard and frequent Long Text first, then Esc/Tab/Enter/slash/Ctrl, and pins a single More button that directly reveals/collapses the optional secondary row. Codex, Claude Code, Antigravity and other CLIs consume the same generic terminal input.

### Reconnect model

All PTY output is processed inside the Worker in one ordered pipeline:

1. update headless xterm;
2. allocate seq;
3. append to bounded replay;
4. deliver to the connected Agent/browser when present.

On attach, the browser sends its fitted rows/columns together with `lastSeq`. The Worker applies that geometry to the canonical PTY/headless terminal before recovery. Retained history is replayed only when the geometry is unchanged and the requested sequence is still retained; a geometry change forces a fresh serialized snapshot. Recovery frames are sent before `hello`, which marks the recovery-complete boundary. Recovery and establishment of the live subscription occur within the same ordered Worker operation, preventing a message gap.

### Safe Workspace Markdown preview

The single GFM/Marked pipeline now renders safe formatting HTML, footnotes, preview-scoped heading anchors, Workspace-relative image embeds, alerts, highlighted code, KaTeX and lazy Mermaid. All image requests reuse protected bounded Workspace reads; Mermaid produces sanitized SVG in a sandboxed no-script iframe with no external network resources. Markdown preserves the 512 KiB text-preview and 8 MiB export boundaries, one vertical preview scroll owner and the existing source/share/reader/Git workflows.

## 中文

PalmTTY 是一个单用户、自托管的交互式开发终端控制面。Web 端主题与视觉性能档只属于浏览器本地展示状态，不进入 Agent、Workspace 或 Session 权限/持久化模型。

每个 Session 由独立 detached Worker 持有。Worker 是 PTY、headless xterm、输出序号、有限 replay 和退出保留期的唯一 canonical owner；Agent 只负责 Web/API、认证、安全策略、Worker 发现与浏览器代理。

Session 生命周期动作明确分离：“终止”把活动会话推进为 `stopping → exited`，退出后的终端状态仍在 retention 内可查看；“重启”先等待旧 PTY 退出，再创建并 adopt 新 Worker，成功后 retire 旧 Session 并生成新 ID；若创建失败则保留旧会话历史和附件，以便查看及重试（原进程不能回滚）；“清除”只允许用于 `exited/failed` 会话，并由 Worker 立即释放 terminal/replay/recovery state 后退出。Agent 不直接删 Worker 的恢复文件来伪造删除。

当前持久化语义包括：

- 浏览器断线后终端继续运行；
- WebSocket 重连后通过 replay/snapshot 恢复；
- Agent 重启后 Worker/PTY 继续运行，新 Agent 可重新发现同一 Session。

不承诺 Windows/主机重启、用户注销或 Worker 本身死亡后的终端持久化。Agent 登录 Session 仍只在内存中，所以 Agent 重启后需要重新登录，再附着原终端。

Windows 本地控制 IPC 使用 Named Pipe；其他当前 CI 平台使用 Unix domain socket。每个 Worker 有独立 256-bit secret，创建时只经匿名 stdin 传入，不发送到浏览器。持久化 PID 只用于诊断，不能作为 kill authority。Agent 暂时无法连接 Worker 并不等于 Worker 已死亡，因此不会仅因 IPC 超时删除可能仍存活 Worker 的恢复能力；已接管 Worker 的控制连接会持续退避重连。Worker 自己拥有 recovery metadata，文件缺失时会重新发布；如果发现恢复权限被其他内容替换，则 fail closed。


浏览器端交互也保持单一所有权：终端滚动物理由 xterm 独占，PalmTTY 只用普通 click/tap focus bridge（以及手机 keybar 的显式键盘按钮）激活 xterm 隐藏 textarea；coarse-pointer/mobile 布局中的可编辑控件统一至少 16px，避免 iOS 聚焦放大。WorkspaceWorkbench 在所有缩放级别都负责当前 VisualViewport 的展示几何，浏览器栏、双指缩放和软键盘先调整整个工作台，再由 terminal mount 的 ResizeObserver/FitAddon 推导终端尺寸；TerminalView 不再直接监听 VisualViewport，`visualViewport.scale` 不会关闭 framing，PalmTTY 也不会写入用户缩放；`?viewportDebug=1` 只输出几何/focus 诊断，不包含终端内容。Git 左侧 sidebar 是“更改 / 历史”与 Git tools 的唯一纵向滚动容器，内部 change/history list 只是内容，不再成为嵌套 scroll owner；Files 可以把当前文件直接带入文件级 Git history，而不改变 Workspace/Session authority。 手机终端快捷键栏只是浏览器侧通用输入适配层，不感知具体 AI CLI：共享纯函数编码器负责 Enter、导航键、Ctrl/Alt 组合和固定控制字符，UI 将键盘和高频长文本固定为前两项，其后是 Esc/Tab/Enter/`/`/Ctrl，滚动区外的“更多”一次展开或收起可选第二行；Codex、Claude Code、Antigravity 等都消费同一套普通终端输入。

PTY 输出、headless mirror、seq 与 replay 都在 Worker 内按同一有序流水线更新，因此 Agent 不在线期间状态仍连续。浏览器恢复时把已 fit 的 rows/cols 与 lastSeq 一起提交；Worker 先把 canonical PTY/headless mirror 调整到该 geometry，尺寸未变且历史仍可用时才 replay，尺寸变化或历史过旧时使用新 geometry 下的 snapshot。恢复帧之后的 `hello` 表示恢复完成，恢复边界与实时订阅之间不留消息窗口。

### External Web applications / 独立 Web 应用

Optional operator-configured URLs expose independent code-server and DeepSeek Harness entries on the home page. Both UIs and their sessions remain independently authenticated and outside PalmTTY's Origin. The Agent owns only its managed Harness child, never the code-server lifecycle. Codex CLI remains a Terminal workload. HTTPS is required except for loopback testing, and credential-bearing URLs are forbidden.

可选外部入口仅保存不含凭据的 URL。首页独立展示 code-server 与 Harness；code-server 由部署者管理安装、进程和认证，Harness 可固定版本安装到本机回环并由 Agent 管理自有进程。PalmTTY 不提供第三方同源代理或 Azure 隧道。

### Mobile recovery and browser read-aloud (October 2026)

Terminal Worker PTY/headless state stays authoritative while a mobile page is suspended. Resuming the page recreates its terminal renderer and obtains a fresh snapshot rather than animating a large backlog; small uninterrupted reconnect gaps may still use bounded replay. This never relaunches the CLI.

Files supports a read-only novel reader using the device's Web Speech API (SpeechSynthesis), with paragraph controls, installed voices, and playback speed. The existing workspace file-content endpoint provides complete text up to 8 MiB; larger files cannot be read aloud through this feature. Audio quality and playback while backgrounded depend on the browser and OS. No novel text is sent to a new cloud speech provider.

### 手机恢复与浏览器朗读（2026 年 10 月）

手机应用进入后台时，终端 Worker 继续独立维护 PTY 与终端镜像。返回前台只重新创建浏览器终端视图，直接获取最新快照，避免大量历史输出逐帧快放；短暂断线仍允许有界 Replay，不会重启 CLI。

文件页新增只读小说朗读视图，通过浏览器 Web Speech API 使用设备可用音色，支持段落导航与语速调节。完整文本沿用现有工作区文件 API，限制 8 MiB；超过上限不会只朗读预览片段。声音品质与后台表现取决于浏览器/系统，不增加云端语音服务和上传权限。

**Privacy/resource limits:** Web Speech defaults may be remote. The browser voice picker shows Chinese-language entries only. It prefers localService=true Chinese voices; remote or unknown voices require explicit per-voice consent and are never automatic fallbacks. If no Chinese voice is reported, the reader explains how to enable one. The reader scans up to 20,000 paragraphs, renders 120 at a time, and prepares speech chunks on demand. A very large number of paragraphs is rejected with a clear message instead of freezing a mobile browser.

**隐私与资源限制：**浏览器默认语音可能依赖远程服务。音色列表仅展示声明中文语言标签的声音；优先选择浏览器报告 localService=true 的中文音色，远程或来源未知的声音须逐音色授权且不自动回退。没有中文音色时显示安装／启用提示。最多解析 20,000 段，单页渲染 120 段，语音片段按需生成；超限会明确提示而不是卡死手机页面。

### Terminal controller lease and novel progress (October 2026)

The `palmtty.v4` browser terminal wire protocol admits exactly one input/resize controller per Session. Extra authenticated connections are read-only and attach using the canonical Worker geometry without resizing PTY; after controller disconnect, an observer may explicitly take control. A random, tab-local ephemeral identity on resume lets the same browser replace an old half-open controller socket after a Wi-Fi/cellular handoff; distinct browsers cannot preempt a live owner. Agent-side WebSocket ping/pong expires unresponsive connections in roughly 45 seconds and denied takeovers show feedback. Lease transitions are serialized, the former connection survives unsuccessful replacement attempts, and a viewer takeover refreshes its Worker snapshot before granting input. The browser proposes actual viewport dimensions without resizing an observer before approval. Short socket interruptions reuse the browser xterm and sequence for bounded replay, while long mobile suspension or backlog restores a fresh <=4 MiB canonical snapshot. Replay is byte- and frame-bounded, and local IPC parses frames incrementally. The read-only novel reader recognizes up to 256 chapter headings and persists a hashed file identity, sampled content signature and paragraph index, never the novel prose.

### 终端控制租约与小说进度（2026 年 10 月）

终端浏览器协议更新为 `palmtty.v4`，每个 Session 仅一个输入/窗口尺寸控制者。额外连接经身份校验后以 Worker 规范尺寸只读附着，不会改变 PTY；控制者断开后才可显式接管。同一浏览器页面用内存态随机身份恢复 Wi-Fi/蜂窝切网后的控制权，可以替换半失效旧连接；其他设备仍不能抢占在线控制者。Agent 的 WebSocket ping/pong 会在约 45 秒后清理失活连接，显式接管失败时网页给出原因提示。控制权变更按 Session 串行执行，附着失败保留旧控制者；观察者接管时从 Worker 重新获取快照，完成恢复后才允许输入。浏览器先只读计算可用尺寸，未获批准前不会改变观察者的终端几何。短网络中断沿用浏览器 xterm 和序号进行有限增量恢复，手机长期后台或渲染堆积则使用不超过 4 MiB 的最新快照。重放缓存按字节及帧数限额，IPC 使用增量解析。小说阅读器识别最多 256 个章节导航项，本地仅保存散列文件身份、抽样内容签名和段落序号，不保存正文。

### Terminal v4 deployment and durable Worker upgrade (October 2026)

Terminal browser clients and the Agent must use `palmtty.v4` together. If a v4 browser meets a still-running v3 Agent, a protocol 1002 close gives an explicit restart-Agent-and-refresh instruction instead of an endless reconnect. Session Workers are independent and may survive the Agent upgrade: an authenticated old Worker IPC v5 still emits a v3 terminal hello. Only at the trusted local IPC ingress does the Agent normalize that precise hello to the current browser v4 shape, preserving the PTY and rejecting unknown versions.

### 终端 v4 部署与独立 Worker 升级（2026 年 10 月）

网页与 Agent 的终端协议必须同时为 `palmtty.v4`。如果更新网页却仍运行旧 Agent，浏览器遇到 1002 版本错误时会提示重启 Agent 并完整刷新。Session Worker 能跨 Agent 重启存活：旧 Worker IPC v5 可能发送 v3 的 `hello`，Agent 仅在已认证的本地 IPC 入口把这一消息精确归一化为浏览器 v4 结构；不重启 PTY，不允许未知版本或旧浏览器入口。


### Terminal TUI input interoperability / 终端 TUI 输入互操作

**English:** Browser input from xterm (including SGR mouse reports, Unicode IME commits, physical/virtual keys and bracketed paste) passes through one ordered, bounded WebSocket input queue. Frames are split at UTF-8 code-point boundaries (<=12 KiB), with <=8 MiB of unsent input and a browser WebSocket buffer high-water limit. Disconnect discards unsent bytes rather than replaying them; a partial paste may already have reached the PTY. Virtual Ctrl/Alt only transforms actual keyboard data and never changes mouse reports or multi-character paste. Xterm retains ownership of touch scrolling and terminal mouse mode. xterm onBinary is deliberately not subscribed; legacy X10 mouse bytes cannot be forwarded losslessly through node-pty's UTF-8 string-write API and are dropped rather than misinterpreted as CLI text. This is not a claim of full legacy mouse or iPhone OpenCode certification.

**中文：** 浏览器将 xterm 的 SGR 鼠标、IME、物理／虚拟按键及 bracketed paste 统一放进顺序、有界的输入队列；按 UTF-8 码点拆分，每帧不超过 12 KiB，未发送队列不超过 8 MiB，并对 WebSocket 发送缓冲实施背压。断线不重放未发送部分，但已入队的部分文本仍可能已经到达 PTY，需要检查后再重试。虚拟 Ctrl/Alt 不改写鼠标报告或多字符粘贴；xterm 继续独占触摸滚动和鼠标模式。旧式 X10/onBinary 鼠标数据全部不转发，node-pty 字符串写入接口不支持任意二进制字节保真；这不代表旧式鼠标协议或 iPhone OpenCode 真机兼容性已经全部通过。


### Touch-inertia mouse validation / 触摸惯性鼠标校验（2026-10）

**English:** Some xterm browser touch-inertia CHANGE events lack pointer coordinates; under a mouse-tracking full-screen TUI this can produce invalid SGR reports with literal NaN and insert "NaNM" into an application's prompt. PalmTTY validates complete xterm onData SGR mouse reports before IME/key processing. Complete valid wheel reports are routed under the active Browse/Interact policy; NaN or otherwise malformed reports are discarded without inventing or reusing previous coordinates. No extra touch-gesture owner or vendor-specific CLI protocol is introduced. Real iPhone Safari and Android Chrome tests remain necessary.

**中文：** xterm 的触摸惯性 CHANGE 事件可能缺少坐标，全屏鼠标模式下生成带有 NaN 的无效 SGR 报告，使应用输入框出现 NaNM。PalmTTY 在 xterm onData 输入边界校验完整的 SGR 鼠标报告：正常滚轮不改变；含 NaN 的惯性报告与其他畸形报告均直接丢弃，不使用历史坐标猜测修复。不会增加第二套触摸手势、解析特定 CLI 或修改会话协议与 Worker；iPhone Safari / OpenCode 的滑动和惯性体验仍需真机验收。

### Compact terminal scrollbar geometry / 终端窄滚动条布局

**English:** The browser terminal configures xterm's public `scrollbar.width` option to 4 CSS px on coarse-pointer devices and 8 CSS px with a precise pointer. This keeps the same width in xterm's scrollable area and FitAddon column calculations. The terminal viewport does not reserve an additional CSS `scrollbar-gutter`; on phone-width layouts only the decorative outer frame padding is tightened. Xterm retains ownership of scrollback, touch momentum, alternate-screen and mouse tracking. Some empty pixels may remain because the terminal fits whole character cells. Real-device Safari/Chrome visual and gesture checks are required before certifying the appearance.

**中文：** 浏览器终端通过 xterm 公开的 `scrollbar.width` 为粗指针触屏设置 4 CSS px、精确指针设置 8 CSS px；滚动区域和 FitAddon 列数计算使用同一宽度。终端 viewport 不再附加 CSS `scrollbar-gutter`，手机窄屏只收紧外层装饰框的 padding。滚动历史、惯性、备用屏幕和鼠标追踪仍归 xterm 管理；字符列只能取整，右侧仍可能出现少量正常余量。最终视觉和手势表现需要 Safari/Chrome 真机验收。

### Mobile TUI wheel navigation and mouse recovery (October 2026)

Browse mode allows only validated SGR wheel reports through to a mouse-tracking TUI while blocking clicks, drags and movement. Interact allows all validated SGR mouse reports. Without mouse tracking, xterm still owns normal-buffer scrollback. There is no parallel touch adapter or transcript buffer. The Worker observes parsed CSI mouse encoding negotiation (1006/1016; unsupported urxvt 1015 is not tracked) and completes the bounded canonical terminal snapshot with the encoding that SerializeAddon does not restore. This prevents a reattached browser xterm from accidentally falling back to legacy X10, which remains unsupported on the UTF-8 node-pty input path. Alternate-screen scrollback remains owned by the TUI, not PalmTTY.

### 手机 TUI 滚动与鼠标协议恢复（2026 年 10 月）

浏览模式只把有效的 SGR 滚轮交给已启用鼠标跟踪的 TUI，继续拦截点击、拖动、移动；交互模式允许全部经过校验的 SGR 鼠标输入。未启用跟踪时普通缓冲区的滚动仍由 xterm 本地处理，不增加第二套触摸适配器或历史缓冲区。Worker 从 headless parser 捕获 1006/1016 鼠标编码（xterm 不支持 1015）协商，并把 SerializeAddon 漏掉的编码状态补在同一个有界快照内，避免重新附着后的浏览器回退到不支持的 X10。备用屏幕的内部消息历史只能由 TUI 自身维护和滚动。

### Viewport-safe confirmations / 手机端确认框（2026-10）


终端与远程应用的终止/清除操作在执行期间保持确认弹窗，失败就地展示，成功才关闭；手机短确认框位于视口底部安全区域。已退出终端从不同尺寸的浏览器重新查看时，不再修改 Worker 端规范终端几何。Pi Regular 滚动和后台重连策略保持不变。


### Markdown 文件预览功能

Files 通过单一 GFM 解析/净化流水线展示常用安全 HTML 排版、脚注、局部标题锚点、工作区相对路径图片、提示块、代码高亮、KaTeX 和按需 Mermaid；图片仍走受保护只读接口，图表在禁止脚本和网络的沙箱中展示。保留 512 KiB 预览与 8 MiB 完整导出边界、正文唯一纵向滚动、源码/朗读/Git 链路。
### Terminal renderer and Pi fullscreen / 终端渲染器与 Pi 全屏滚动条（2026-10）

**English:** Browser xterm prefers a version-matched WebGL2 addon with custom Box Drawing/Block Elements glyphs so full-screen TUIs such as Pi can draw vertically adjacent scrollbar cells without typical DOM font gaps. The same xterm instance falls back to its DOM renderer on unavailable WebGL2, failed activation or context loss; it does not reconnect the PTY, change canonical Worker state or create a second scroll owner. The xterm 4 CSS px touch scrollbar is distinct from Pi's character-drawn scrollbar. Normal scrollback remains local xterm inertia; fullscreen TUI scrolling goes through validated SGR wheel reports and cannot be promised Safari-native pixel momentum. Real mobile browser testing remains necessary.

**中文：** 浏览器 xterm 优先启用精确版本匹配的 WebGL2 插件和框线/块状字符自绘，改善 Pi 等全屏 TUI 逐行绘制滚动轨道时的字形间隙；WebGL2 不可用、装载失败或 context loss 时同一个 xterm 实例退回 DOM，既不重连 PTY，也不增加滚动状态或改变 Worker 规范历史。xterm 的触屏 4 CSS px 滚动条与 Pi 在字符单元格中绘制的竖线是两个不同对象。普通历史沿用 xterm 惯性；全屏 TUI 仍消费经过校验的 SGR 滚轮信号，不能等价于 Safari 原生逐像素滚动。真机验收仍是必要步骤。

## Novel speech architecture / 小说语音架构 (2026-10)

**English:** Files exposes a read-only novel reader. A single Web controller owns document/chapter/paragraph positions, bounded sentence-group scheduling and playback state. BrowserSpeechOutput filters Web Speech voices to declared Chinese language tags (including Mandarin and Cantonese), excluding non-Chinese entries even when their display names are misleading. It distinguishes on-device, remote and unknown-origin Chinese voices; remote/unknown use requires per-voice confirmation. QwenSpeechOutput talks only to the authenticated Agent speech API; the Agent uses a fixed loopback address and private host-side token to talk to an optional separately installed Python Qwen3-TTS CustomVoice sidecar. Model files are not bundled with PalmTTY. Audio and cached synthesized clips remain bounded. Neither engine changes Workspace file authority or uses Terminal Worker IPC.

**中文：** Files 中的只读小说阅读器由唯一控制器管理正文／章节／段落偏移、语音分块及播放状态。浏览器语音仅列出声明为中文语言标签的系统声音（包括普通话与粤语），排除非中文音色而不根据音色名称猜测；中文音色仍区分本地、在线和来源未知，后两者须逐音色确认。Qwen 通过受认证的 Agent 语音接口和固定本机端口连接独立 Python CustomVoice 服务，不将 PyTorch、模型生命周期或音频塞进终端 Worker。模型权重不随 PalmTTY 安装包发布；音频缓存有上限。两种语音引擎均不能修改 Workspace 文件。
