# 手机端 Web/PWA

## 目标

手机端不是把桌面终端简单缩小，而是把“远程控制 AI CLI”作为主要交互场景。

## 当前界面

首页提供：

- Workspace 列表与数量；
- 在网页端创建、编辑、删除持久化 Workspace；
- “新建工作区”不等待可选运行环境探测即可打开；Host 始终可配置，WSL 选项在能力探测完成后按结果显示；
- Workspace 对话框由 React 状态控制开关，原生 `dialog` 的激活逻辑可重复执行，兼容开发环境 StrictMode；
- Workspace 根页不再直接堆叠 Host/WSL/App 高级字段：基础页只保留名称、cwd、environment，并通过独立的 Terminal / Remote Apps 设置入口进入对应 Activity 配置；
- 工作目录支持在网页内浏览并选择 Agent 宿主机或所选 WSL 发行版中的目录；这是远端目录浏览，不调用浏览器本机文件选择器；
- Workspace 弹窗继续使用固定 Header / 单一可滚动 Body / 固定 Footer，但 Body 现在是层级设置页：Workspace → Terminal 或 Remote Apps → 单个 App / App 选择器；返回/关闭/保存操作始终可达，目录与 executable 列表各自只作为有界数据区滚动；删除确认使用统一主题确认框；
- Terminal 设置页只显示一个“终端环境”选择器：已知 Host Shell 与已注册 WSL 发行版作为一级 Profile；Host/WSL 内部 runtime、显式 shell/argv 只在“自定义”高级路径展开；Terminal startup command 也归入此页；
- 环境变量使用每行一个 `NAME=value` 的结构化编辑，适合代理等必须在 Shell 启动前存在的变量；为兼容从 PowerShell/文档复制的写法，最外层成对单引号/双引号会在保存时去除，不成对引号直接报错；它们持久化在 Workspace 中，不是密钥存储；
- 启动命令改为多行输入，并提供常用终端 Agent 快捷项，目前包括 Codex、Claude Code、Antigravity、Gemini CLI、OpenCode、Aider，点击只填写命令，不负责安装工具；
- Workspace 卡片可创建 Terminal Session，也可直接启动已保存 Remote App Profile；
- 首页把 Terminal Session 与 Remote App Session 合并为一个 Activity 列表；
- Activity 状态和连接数保持显式；运行/终止中的 Activity 显示连接状态，已退出 Activity 显示退出码（如果可用）；
- 会话动作按生命周期分离：运行中的会话显示“终止”，已退出/失败会话显示“清除”；会话工作台提供经确认的“重启终端”，它会替换 PTY/Session 并重新读取最新 Workspace/宿主环境；不再使用含义模糊的红色 ×；
- WorkspaceWorkbench 是 Activity-aware 工作台：顶栏可在同一 Workspace 的 live Terminal/App Activity 间直接切换；当前 Activity 旁仍提供 Git/Files Workspace Tool；Artifacts 只在 Terminal Activity 中出现。Git 与 Files 使用 Workspace authority，不从 PTY 当前 `cd` 猜测作用域；
- 登录/退出；
- 中文 / English 语言切换并在浏览器本地保存偏好。

## 视觉系统

当前 Web UI 使用 PalmTTY 自己的主题域，不把 TauTerm 组件或桌面布局直接搬入移动端：

- 视觉实现分为设计 token、共享透明玻璃物理、主题 veil、语义 surface 四层；
- 提供炫彩流光（Spectrum）、黑曜石（Obsidian）、白霜（Frosted）三套主题，三者共享同一材质物理，只通过 veil 与对比度令牌形成身份；
- 提供效果优先 / 性能优先两档。性能优先保留完整四色环境，但停止装饰动画并移除 shell backdrop sampling；
- 系统请求 reduced motion 时停止装饰动画，并在外观控制中显示状态；
- 大面积终端/面板不使用实时 backdrop blur；只有小面积 shell surface 在效果优先模式允许有限采样；
- Workspace/确认框使用专用 modal surface，通过更强 veil 和遮罩保证可读性，不依赖大面积 backdrop blur；
- 终端 viewport 使用独立 terminal surface，宿主 gutter 与 xterm canvas 复用同一个主题背景值，不再在 xterm 下叠加通用 glass-content；
- xterm 调色板属于主题层，主题变化只原位更新 xterm options，不重建终端、不重连 WebSocket，也不触碰 Worker/recovery 状态；语言等展示状态同样不进入终端 transport 生命周期；
- 主题与性能档仅保存在浏览器本地，属于展示偏好，不进入 Agent 配置、Workspace 或 Session 权限模型；
- 主题规范唯一来源为 `.agents/skills/palmtty-theme/SKILL.md`，审查流程为 `.agents/skills/palmtty-theme-review/SKILL.md`；本文不复制颜色/材质参数。

会话工作台提供：

- “终端 / Git / 文件 / 附件”四个一级视图，终端始终是核心视图；
- 切到 Git/文件/附件时 Terminal 组件保持 mounted，xterm、WebSocket、`lastSeq` 与重连循环不被展示状态重建；隐藏时不传播 resize，切回终端再安全 `fit`；
- Git 视图是轻量 Source Control 工作台，并在页内提供“更改 / 历史”两个一级子视图。“更改”显式显示完整仓库作用域、分支/上游/ahead-behind、冲突、staged/unstaged/untracked；diff 使用结构化 unified diff 行渲染并支持未跟踪文件预览；支持 rename-aware 的单文件 stage/unstage、显式仓库级 stage-all/unstage-all、带 diff 快照校验的丢弃、commit、分支创建/切换、stash，以及非交互 fetch/pull/push；status 一旦被截断或解析不完整，所有写/remote 控件立即禁用。“历史”始终只读，不需要启用 Git 写权限，按需加载基于首次 HEAD snapshot 的 opaque cursor 分页；支持全仓库 history、文件级 `--follow` history、commit 元数据/changed files 与单文件 commit diff；根提交按 empty-tree 查看，普通/merge 提交统一按 first parent 作为历史审查基线，避免 merge commit 在默认 diff-tree 语义下出现空详情。Files 可直接把当前文件路径带入 History，形成“章节/文件 → 历史 → 提交 → diff”的移动端链路。进入页面、窗口重新聚焦/回到前台和可见页低频轮询都会刷新 status；Git sidebar 仍是 changes/history/tools 的唯一纵向滚动 owner，列表自身不建立第二层纵向滚动区；
- 文件视图以持久 Workspace 根目录为边界浏览目录和文件，提供 UTF-8 文本只读预览；PNG/JPEG/WebP/GIF 通过独立受保护接口按真实签名、尺寸/像素边界校验并使用稳定有界读取后直接预览，其他二进制文件只显示状态，大文本预览在 512 KiB 截断。预览与“完整文件”语义明确分离：复制完整文本、系统 Share Sheet 文件分享和下载 fallback 使用独立、同 containment 的 8 MiB 有界完整文件接口，因此不会把 512 KiB 截断预览误当成完整内容；手机预览标题优先显示 basename，把父目录作为次级信息，并可一键进入该文件 Git 历史；
- 附件视图是 Session 范围的图片入口：手机/桌面浏览器可选择 PNG/JPEG/WebP/GIF，上传后显示尺寸/大小与大图预览，支持删除，并可把基于 Session 创建时不可变运行身份得到的 runtime 可读文件路径写入当前终端输入流。该动作只写路径文本 + 空格，不发送 Enter；附件不进入 Workspace/Git，Agent 重启时跟随仍存活 Session 恢复，旧 Session retirement 后清理；
- xterm.js；浏览器端 xterm/fit 由根目录 `terminal-stack.json` 精确锁定，当前浏览器栈使用包含上游触摸滚动修复的 xterm 6.1 beta，而 Worker 端 headless/serialize 暂时保持稳定 6.0/0.14，避免把移动端输入修复与 canonical snapshot/recovery 升级绑在一起；
- 手机终端不再维护 PalmTTY 自己的逐行 touch adapter：`.xterm-screen` 只用 `touch-action: none` 阻止 Safari/浏览器把手势变成页面平移，触摸事件继续由 xterm 自己的 Gesture/Viewport 路径处理，因此 normal scrollback 使用连续像素滚动与惯性，alternate buffer、mouse tracking、滚动条也保持同一套 xterm 语义；不建立第二个 DOM 滚动层，也不增加应用级 document touch handler。终端普通 click/tap 只承担 `terminal.focus()` 的键盘激活桥接，不读取 touch delta、不拦截 swipe；手机 keybar 另提供显式“键盘”按钮作为可靠入口；在 coarse-pointer/mobile 布局上，所有可编辑 `input/textarea/select`（包括紧凑主题/性能/语言选择器、登录/Git 输入和 xterm helper textarea）统一至少 16px，避免 iOS 因聚焦小字号控件而主动放大页面；
- 自动重连状态；
- 浏览器键盘/IME 仍以 xterm 为唯一主 owner；针对 iOS/CJK 输入法 `keyCode=229` 的已知上游缺口，只在 xterm 公开的 textarea / custom-key-handler / input API 外围增加一个窄状态机：暂存同一事务内的 `onData`，等 textarea 最终值后只提交一次差量；真实 `compositionstart` 会立即取消兜底。物理 Ctrl+字母、Ctrl+Space、Escape 只在非 composing 的 229 keydown 且有明确 `KeyboardEvent.code` 时恢复，避免 keyup 重复发送；
- Terminal 启动命令预设包含 Pi（`pi`）、Codex、Claude Code 等通用 CLI；预设仅填充 `workspace.terminal.startupCommand`，不在浏览器执行安装/检测，不引入厂商专属终端协议。浏览器 xterm 显式开启 Kitty keyboard VT extension，通用编码器提供 Shift+Enter/Alt+Enter CSI-u 和 Ctrl+Q。终端鼠标、IME、单一输入队列及安全边界保持不变；iPhone Safari 与实际 Pi 的组合键/中文输入仍需验收。
- 手机快捷键栏不再由 `TerminalView` 手写字节序列：独立纯函数编码层统一负责基础键、Ctrl/Alt 修饰、xterm CSI 导航和 DECCKM application-cursor 模式；手机键盘和高频长文本固定为前两项，常用行还保留 Esc、Tab、Enter、`/`、Ctrl；方向键、Ctrl+C/J/D、Shift+Tab 等通过固定在滚动区外的“更多”一次展开；
- “更多”固定在第一行滚动区外，一次点击直接打开第二条横向可滚动按键行，再点“收起”关闭，不再经过完整模式或保留几乎不节省高度的隐藏态；其中补充 `\\`、`|`、`~`、PgUp/PgDn、Home/End、Backspace/Delete，以及 Ctrl+L/R/O/G/K/A/E/U/W。Ctrl / Alt 仍是一键一次性修饰，软键盘字符与虚拟导航键共用同一修饰语义，成功发送或断线后都会清除 armed 状态；
- 适合粘贴、语音输入和 AI Prompt 的按需长文本弹窗通过 xterm `paste()` 进入终端，保留 bracketed-paste 语义，并把“仅粘贴”和“粘贴并回车”分成两个显式动作；不再常驻聊天式发送栏；
- A−/A+ 调整浏览器本地终端字号（11–18px），直接更新已挂载 xterm 后走现有 ResizeObserver/FitAddon refit，不重建 xterm/WebSocket/Session；这用于窄屏宽表格等密集输出的可读性调节，而不是解析或重排 CLI 输出；
- 竖屏/横屏布局；
- Safe Area 处理；
- 终端视觉框与 Fit 几何已拆成两层：外层 `terminal-frame` 负责主题背景、边框、圆角、padding 与裁剪，内层 `terminal-mount` 保持无 padding/无 border 并作为 `terminal.open()`、FitAddon 与 ResizeObserver 的唯一几何基准；这避免 FitAddon 把外层 padding 误算成可用行高后再被 `overflow:hidden` 裁掉最后一行。xterm viewport/scrollable remainder 与 canvas 继承同一个 `--terminal-background`，因此整数行之外的剩余高度不会显示成默认黑条；xterm 继续使用略大的 lineHeight，主题背景保持与页面基底协调；
- WorkspaceWorkbench 是移动端可视几何的唯一 owner：无论 `visualViewport.scale` 是否为 1，整个工作台都跟随当前 VisualViewport 的 width/height/offset，因此 Safari 地址栏、双指缩放与软键盘出现/消失时 Header、终端和 keybar 仍留在真实可见区域；scale 只作为诊断值，不作为关闭布局修正的条件，PalmTTY 也不会写入、禁止或强制重置浏览器缩放；viewport meta 同时声明 `interactive-widget=resizes-content` 作为支持浏览器的渐进增强；
- 首次连接/重连会先 `fit` 得到浏览器实际 rows/cols，并把几何尺寸随 resume 一起提交；snapshot/replay 完成前冻结再次 fit，避免把服务端按旧尺寸序列化的终端状态写进新尺寸 xterm；TerminalView 只监听 terminal mount 的 ResizeObserver，Workbench/软键盘造成的可用高度变化先改变 mount，再由同一 ResizeObserver → FitAddon 路径传播；只有实际 rows/cols 变化才向 Worker 发送 resize；
- 恢复期间终端输入与长文本发送按钮保持不可用，尚未提交的长文本不会因为连接尚未就绪而被静默清空；
- PWA manifest 已补齐 PalmTTY 自有品牌资产：保留透明 `logo.png` 作为标准横版品牌图，提供 192/512 方形应用图标并接入 favicon、Apple touch icon 与安装 manifest；界面标题采用图标 + 主题文字而不是把固定颜色的位图字标强塞进所有主题，保证 Spectrum / Obsidian / Frosted 下的对比度与可访问性；
- 仅显式使用 `?viewportDebug=1` 时显示移动端 viewport 诊断覆盖层，输出 inner/client/visual viewport 尺寸、offset、scale、screen、DPR 和当前 focus element；它不输出终端内容、输入值或认证信息，用于真机 Safari 定位浏览器级 viewport 状态。

## 设计边界

- 长文本弹窗通过 xterm 普通 paste/input 语义发送，附件路径插入仍然只作为终端输入，不建立 Codex/Antigravity 专用 API；PalmTTY 不保证所有 CLI 对裸路径使用同一种图片引用语法，也不解析 Markdown 表格并重排终端输出，厂商与呈现差异留在 CLI/终端层。
- Workspace 修改走独立持久化 API；Session 创建/重启不接收临时 cwd/shell/env。终端 Profile 发现只是受保护、有界的运行环境读取 API，不是通用命令执行接口。
- 目录选择器仍只读取目录名称/路径，不读取文件内容；会话工作台的文件浏览/预览/完整文件导出是另一组独立受保护 API，使用相对 Workspace 路径并在 Agent 端做 canonical/symlink containment 检查。完整文件导出仍是只读、有界能力，不改变 Workspace authority，也不能复用目录选择器绕开边界。
- Git 工作台只通过独立、有界、typed 的 Agent API 工作，不把 Git 命令塞进终端 WebSocket，也不进入 Session Worker。读取面使用 porcelain v2 status、diff/branches，以及 snapshot-stable 的分页 history、文件 history、commit detail/file diff；禁止 external diff/textconv/fsmonitor，history/commit metadata 同样关闭 signature helper；working-tree diff 会先解析该路径的 filter attribute，并在本次 diff 中中和 clean/process/required，避免查看动作触发内容过滤程序。写面只接受固定 operation union，不接受浏览器提供任意 argv。所有写操作携带当前 state token，破坏性丢弃还必须匹配刚加载的 diff snapshot；Web 默认关闭写按钮，用户在当前 Session workbench 确认“信任仓库”后才发送写请求，该确认在终端/Git/文件/附件页签切换间保留，离开 Session 页面后失效。PalmTTY 禁用 Git hooks、编辑器/credential 交互提示，但正常 Git filter 仍可能在 stage/switch/stash/pull 等语义中执行，因此这一确认是能力边界提示而不是沙箱。辅助子进程继续剔除 `PALMTTY_*` 控制环境命名空间以及单独配置的认证 token 环境变量。
- 浏览器丢失状态时以服务端 snapshot 为准。
- 终端依赖升级必须把 `terminal-stack.json`、两个 package manifest 与 frozen lockfile 作为一个变更集，并通过 `pnpm terminal:check`；浏览器 xterm 与 Worker headless 可以为了明确的浏览器修复暂时处在同一 major 的不同 minor/pre-release，但 Worker 端升级必须单独验证 serialize/replay/geometry recovery。
- `stopping` Session 可以继续被查看，但终端输入、resize 与长文本发送保持禁用，直到 Worker 报告最终退出。
- Service Worker 不缓存 API 或终端 WebSocket 数据。
- 终端输出只交给 xterm 渲染，不作为 HTML 注入页面。

## 后续可以做

- 自定义快捷键；
- 文件多选与批量上下文导出（只有真实创作/审查流程证明单文件复制/分享不足时再设计）；
- Git 写能力已经采用 typed operation + stale-state/diff-snapshot + 明确信任确认模型落地；后续如需 force push、interactive rebase/cherry-pick、reflog/submodule/LFS 管理，应继续逐项建模，不能退化成任意 Git argv API；文件编辑仍需单独设计并发修改、编码与原子写入；
- Codex 等 AI CLI 的状态提示，但保持 CLI 厂商无关。

## 你审查时重点看

手机体验优化不能绕开终端协议新增隐式高权限 API。Git/文件能力已经通过独立、有界 Workspace API 落地：Files 保持只读，Git 只开放 typed 写操作。继续增加更高级 Git 或文件写能力时仍必须单独审查权限、仓库 hooks/filters、并发写、symlink/路径逃逸与敏感环境变量继承。

## Remote App 手机交互

WorkspaceWorkbench 把 Terminal 与 Remote App 作为独立 Activity，把 Git/Files 作为共享 Workspace Tool，把 Artifacts 保持为 Terminal Session scope。切换 Git/Files 不卸载当前 Activity；如果同一 Workspace 有多个 live Terminal/App，Header 的 Activity selector 可以直接切换，不必先回首页。

Remote App Profile 的普通编辑流程不再要求用户理解帧率/分辨率：

1. 添加应用；
2. 从已检测应用选择，或浏览宿主 Windows 的目录 + `.exe`；
3. 可选填写 argv；
4. 手工 executable 路径只在 Advanced 中作为兜底。

Remote App Surface 使用三种显式触摸语义：

- 查看：不发送 pointer，浏览器保留 pinch zoom/页面手势；
- 直触：屏幕坐标映射到目标应用窗口；
- 触控板：单指相对移动、轻点点击、双指滚动。

画质为自动模式。Surface 的实际几何/DPR 通过 bounded display hint 发给 AppWorker/helper，横竖屏或 viewport 变化后自动缩放，不把 FPS/宽高存进 Profile。

手机 Terminal 和 Remote App 复用共享「键盘、长文本」主按钮。Terminal 键盘继续聚焦 xterm；Remote App 键盘在点击时同步聚焦 16px 字号、1px 大小的 Safari 隐形输入桥，不再覆盖远程应用画面；已确认 Unicode 以有界消息按帧合并发送，连续 Backspace/Delete 每批最多 32 次；长文本保留可编辑预览和明确发送，断线时即时输入中尚未发送的文字可转到长文本面板。常用 Ctrl/Alt/Shift、方向、Enter、Tab、Esc、Backspace/Delete 沿用 allowlisted typed key。Remote App 不复用 xterm textarea，也不把桌面输入逻辑混入 TerminalView。

Remote App 画面状态必须可诊断：等待窗口、等待首帧、正在串流、capture unavailable 与 WebRTC 路径失败分别显示；不能把所有失败都退化成黑屏。浏览器首帧成功解码后停止初始等待覆盖层，后续故障以外置控制条中的非阻塞提示呈现；详细计数在选项中按需查看。公网/反向代理环境如果需要 TURN，Web 只使用认证 capability 返回的 host-configured ICE servers；UI 不提供任意 ICE 注入。



## 远程 App 沉浸式手机布局

工作区在远程 App 活动中使用紧凑单行顶栏，Git/文件改由工具菜单进入。沉浸模式同时隐藏顶栏并将工作台改为单行内容 Grid，避免绝对定位的 Activity Pane 失去高度；底部外置控制条保留显式退出按钮。操作模式、选项/诊断不再常驻遮挡视频；底部控制条与核心快捷键 Dock 一起固定在 VisualViewport 可见区域内，额外导航按键通过“更多”展开。共享页面的 section 顶部留白只作用于首页，不作用于视频组件。视频默认完整等比展示，用户可以选择裁切填充；坐标映射与实际 object-fit 对齐，不会盲目拉伸内容。

直触/触控板模式使用主动的表面级 touch-action 和非被动 touchmove，仅拦截远端画面区域内部的手势；查看模式保留原生浏览器缩放。触控板状态机明确管理单指移动/轻点、双指中心滚动、部分抬起和取消；取消不合成 click。可选窗口适配通过有界 typed display hint 请求，Windows Host 必须重新验证 Job 归属才能改变尺寸。

## 精简 CLI 与手机导航

Terminal/Remote App 在手机上共用单行工作台标题栏，通过按需展开的「工具」访问 Git、文件及终端附件。Terminal 键栏直接显示手机键盘、长文本、Esc、Tab、Enter、`/`、Ctrl，“更多/收起”固定在横向滚动区之外，一次点击展开或收起包含 Alt、方向键、Ctrl 快捷键、字体大小及编辑按键的第二行。已移除多余的完整/隐藏状态；展开仅改变浏览器布局，由原有 mount ResizeObserver/FitAddon 重新计算终端行列，不能重建 xterm 或 WebSocket。

Remote App 视频仅叠加不接管触摸事件的主题 SVG 鼠标，坐标来自受控 Windows 窗口；支持长按拖动和双指右键，DataChannel 就绪与 Windows 原生输入被拒绝分别显示。

## 本轮 CLI 与 Remote App 微调

CLI 将长文本固定在键盘之后第二位，仅保留始终可见的核心行和直接展开的“更多/收起”，不再提供收益有限的隐藏态或中间完整模式。Remote App 底部常用/额外按键均使用共享 `.glass-panel` 主题材质与标准控制令牌，不再以不透明 `--flat-content` 单独铺底。鼠标光标由 26×34 缩小为 17×24 CSS px，描边与阴影同步减轻，保留受控窗口验证与 contain/cover 映射。真机主题矩阵仍需部署后验收。

## Remote App 无显示器与输入状态

WebRTC 已连接只说明媒体通道可用；手机在当前已连接视频旁仍需独立呈现有类型的 Windows 输入诊断。原生 Host 只报告严格的抽象状态：断开的 Windows 用户会话、锁屏／UAC／非默认交互桌面、无活动显示输出、当前 Job-owned 窗口失效、焦点激活失败、当前点击被任务栏或其他窗口遮挡，以及原生输入被拒绝。所有消息在视频外的 Dock 呈现，不重新叠加覆盖远程软件的阻断弹窗，不暴露 Windows PID/HWND/全局坐标。媒体状态、键盘／长文本、查看／触控板／直触、沉浸模式及主题布局保持不变。

## 小说只读朗读模式（2026-10）

Files 的普通文本预览可以进入独立阅读视图，沿用 Workspace 文件 API 的身份认证、路径限制及只读权限，不新增文件写接口，也不依赖 Terminal Worker。阅读视图按段落显示并高亮当前段落；浏览器 SpeechSynthesis 对长段落按中文标点优先拆分为最多 180 Unicode 字符的语音片段。支持播放/暂停/继续/停止、上一段/下一段、点击段落开始、选择设备已安装音色、语速保存。切换文件或退出阅读视图会取消播放。

超过 512 KiB 的普通预览会通过现有完整内容端点重新加载后才进入阅读模式，避免把预览截断误认为全文；该端点继续保留 8 MiB 硬上限，超出明确提示不能朗读。不提供云 TTS、离线模型、音频导出或锁屏播放保证；原生语音在移动浏览器后台可能被系统中断。中文音色质量取决于宿主设备。

补充隐私与性能边界：Web Speech API 不保证默认声音为离线音色。播放器仅允许浏览器明确报告 localService=true 的音色，并显式指定该 voice；无本地音色则禁用朗读，不回退到联网默认音色。阅读器最多解析 20,000 段，每页只渲染 120 段，播放时按需生成语音块，不预先创建整章的发声队列。分页控件在正文滚动区内；播放/音色/语速始终位于固定控制区，不制造第二纵向滚动容器。

## 阅读进度与终端只读观察者（2026-10）

阅读器识别中文“第 N 章/回/节/卷”与英文 Chapter 标题，最多显示 256 个章节导航。浏览器本地仅保存匿名文件键、抽样内容签名和当前段落序号；不持久化正文，文件签名不匹配时不使用旧进度。即使无本地音色仍能导航正文，但不能联网朗读。

同一 Terminal Session 仅有一位控制者可输入或修改 PTY 尺寸，其余浏览器以只读观察模式展示 Worker 的规范终端尺寸。控制者断开后可以显式申请接管；这不是额外的用户权限层。短网络断线继续原 xterm，长时间后台或渲染出错才通过有界快照恢复。


## 通用 TUI 鼠标与长文本输入加固（2026-10-14）

- 手机终端仍由 xterm.js 自己处理触摸滚动、滚轮、鼠标追踪和全屏 TUI。PalmTTY 不针对 OpenCode 注入专属鼠标协议、不拦截 touchmove，也不增设第二套手势物理系统。
- 浏览器将 xterm 的输入统一写入有界队列，按 Unicode 码点拆成最多 12 KiB 的 WebSocket 输入帧；单连接尚未发送的输入最多保留 8 MiB，浏览器发送缓冲过高时等待清空再继续。对于超出预算的长文本，保留编辑弹窗及草稿，并显示错误提示。bracketed-paste 前后标记及显式回车保持同一 FIFO 顺序。
- Ctrl/Alt 虚拟修饰只作用于单字符或已识别的导航按键，不改变 SGR 鼠标报告、控制序列和多字符粘贴；SGR 鼠标报告不参与 iOS 229 输入法文本兜底。旧式 onBinary 的纯 ASCII 报告可透传，但包含 0x80–0xff 的原始鼠标字节无法通过当前 node-pty 的 UTF-8 字符串写入接口无损还原，会显式告警并阻止发送，不宣称支持所有旧协议。
- 断线时不会重放未发送队列；由于已送入浏览器 WebSocket 的字节无法获得 PTY 级确认，大段粘贴在断线时可能部分成功，需要先检查末尾内容再重试。真机 iPhone Safari、OpenCode、Windows ConPTY 的完整鼠标兼容性仍需验收。


## OpenCode 手机滑动输入污染修复（2026-10-14）

OpenCode 等全屏 TUI 开启 mouse 后，xterm.js 的触摸惯性事件可能缺失 clientX/clientY；鼠标坐标编码出现 NaN，应用不识别 ESC 报告时会把 NaNM 等残片显示在输入框。此问题与小说文字的编码无关，也不应该使用逐行手势模拟来规避。

终端的 xterm 输入边界增设极窄的 SGR 鼠标报告校验：正常报告原样发送，只有近期已确认的滚轮坐标可以用于修复惯性滚动产生的 NaN 坐标；没有有效参考坐标、超过 2 秒、非滚轮或鼠标跟踪关闭时直接丢弃。异常报告不得进入 IME 输入事务或作为文本发给 PTY；方向键、中文输入、长文本粘贴等保持原有语义。终端仍由 xterm.js 独占触摸滚动和惯性物理，没有自己的 touchmove handler、额外滚动层或 OpenCode 专属适配。真实 iPhone Safari 滑动/甩动需部署后验收。
