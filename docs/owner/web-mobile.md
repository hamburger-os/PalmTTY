# 手机端 Web/PWA

## 目标

手机端不是把桌面终端简单缩小，而是把“远程控制 AI CLI”作为主要交互场景。

## 当前界面

首页提供：

- Workspace 列表与数量；
- 在网页端创建、编辑、删除持久化 Workspace；
- “新建工作区”不等待可选运行环境探测即可打开；Host 始终可配置，WSL 选项在能力探测完成后按结果显示；
- Workspace 对话框由 React 状态控制开关，原生 `dialog` 的激活逻辑可重复执行，兼容开发环境 StrictMode；
- Host / WSL runtime 选择与运行目标校验；
- 工作目录支持在网页内浏览并选择 Agent 宿主机或所选 WSL 发行版中的目录；这是远端目录浏览，不调用浏览器本机文件选择器；
- Workspace 弹窗使用固定 Header / 单一可滚动 Body / 固定 Footer 的三段结构，长表单滚动时关闭、取消、保存操作始终可达；目录列表作为有界数据区可独立滚动；删除确认使用统一主题确认框，不再调用浏览器原生 `confirm()`；
- 正常流程只显示一个“终端环境”选择器：已知 Host Shell 与已注册 WSL 发行版都作为一级 Profile 出现；Host/WSL 内部 runtime、显式 executable/argv 只在“自定义”高级路径展开；
- 环境变量使用每行一个 `NAME=value` 的结构化编辑，适合代理等必须在 Shell 启动前存在的变量；为兼容从 PowerShell/文档复制的写法，最外层成对单引号/双引号会在保存时去除，不成对引号直接报错；它们持久化在 Workspace 中，不是密钥存储；
- 启动命令改为多行输入，并提供常用终端 Agent 快捷项，目前包括 Codex、Claude Code、Antigravity、Gemini CLI、OpenCode、Aider，点击只填写命令，不负责安装工具；
- 新建会话；
- 已运行会话列表；
- 会话状态和连接数；运行/终止中的会话显示连接数，已退出会话显示退出码（如果可用）；
- 会话动作按生命周期分离：运行中的会话显示“终止”，已退出/失败会话显示“清除”；会话工作台提供经确认的“重启终端”，它会替换 PTY/Session 并重新读取最新 Workspace/宿主环境；不再使用含义模糊的红色 ×；
- 会话页面升级为轻量工作台，顶栏提供“终端 / Git / 文件”一级切换；Git 与文件视图使用 Workspace authority，而不是尝试从 PTY 猜测当前 `cd`；
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
- Git 视图已经升级为轻量 Source Control 工作台：显式显示“完整仓库”作用域、分支/上游/ahead-behind、冲突、staged/unstaged/untracked；diff 使用结构化 unified diff 行渲染并支持未跟踪文件预览；无选中修改时显示最近提交；支持 rename-aware 的单文件 stage/unstage、显式仓库级 stage-all/unstage-all、带 diff 快照校验的丢弃、commit、分支创建/切换、stash，以及非交互 fetch/pull/push；status 一旦被截断或解析不完整，所有写/remote 控件立即禁用；进入页面、窗口重新聚焦/回到前台和可见页低频轮询都会刷新状态；左侧 Git sidebar 是 repository summary、change groups、commit/branch/stash 的唯一纵向滚动 owner，change group/list 自身不再创建嵌套滚动区，因此鼠标滚轮、触控板和手机一指滑动在 change row 上都能自然滚动；
- 文件视图以持久 Workspace 根目录为边界浏览目录和文件，提供 UTF-8 文本只读预览；PNG/JPEG/WebP/GIF 通过独立受保护接口按真实签名、尺寸/像素边界校验并使用稳定有界读取后直接预览，其他二进制文件只显示状态，大文本预览在 512 KiB 截断；
- 附件视图是 Session 范围的图片入口：手机/桌面浏览器可选择 PNG/JPEG/WebP/GIF，上传后显示尺寸/大小与大图预览，支持删除，并可把基于 Session 创建时不可变运行身份得到的 runtime 可读文件路径写入当前终端输入流。该动作只写路径文本 + 空格，不发送 Enter；附件不进入 Workspace/Git，Agent 重启时跟随仍存活 Session 恢复，旧 Session retirement 后清理；
- xterm.js；浏览器端 xterm/fit 由根目录 `terminal-stack.json` 精确锁定，当前浏览器栈使用包含上游触摸滚动修复的 xterm 6.1 beta，而 Worker 端 headless/serialize 暂时保持稳定 6.0/0.14，避免把移动端输入修复与 canonical snapshot/recovery 升级绑在一起；
- 手机终端不再维护 PalmTTY 自己的逐行 touch adapter：`.xterm-screen` 只用 `touch-action: none` 阻止 Safari/浏览器把手势变成页面平移，触摸事件继续由 xterm 自己的 Gesture/Viewport 路径处理，因此 normal scrollback 使用连续像素滚动与惯性，alternate buffer、mouse tracking、滚动条也保持同一套 xterm 语义；不建立第二个 DOM 滚动层，也不增加应用级 document touch handler。终端普通 click/tap 只承担 `terminal.focus()` 的键盘激活桥接，不读取 touch delta、不拦截 swipe；手机 keybar 另提供显式“键盘”按钮作为可靠入口；在 coarse-pointer/mobile 布局上，所有可编辑 `input/textarea/select`（包括紧凑主题/性能/语言选择器、登录/Git 输入和 xterm helper textarea）统一至少 16px，避免 iOS 因聚焦小字号控件而主动放大页面；
- 自动重连状态；
- 手机快捷键栏不再由 `TerminalView` 手写字节序列：独立的纯函数按键编码层统一负责基础键、Ctrl/Alt 修饰与 xterm CSI 导航组合，UI 组件只声明动作；Enter 作为核心键前置，核心行还提供 Esc、Tab、方向键、Ctrl+C、Ctrl+J、Shift+Tab、Ctrl+D；
- “更多”展开行为只增加第二条横向可滚动按键行，不建立新的纵向 scroll owner；其中提供 PgUp/PgDn、Home/End、Backspace/Delete，以及 Ctrl+L/R/O/G/K/A/E/U/W。Ctrl / Alt 仍是一键一次性修饰，但现在软键盘字符与虚拟导航键共用同一修饰语义，成功发送或断线后都会清除 armed 状态；
- 适合粘贴、语音输入和 AI Prompt 的按需长文本弹窗；不再常驻聊天式发送栏，从而把垂直空间还给终端；
- 竖屏/横屏布局；
- Safe Area 处理；
- 终端视觉框与 Fit 几何已拆成两层：外层 `terminal-frame` 负责主题背景、边框、圆角、padding 与裁剪，内层 `terminal-mount` 保持无 padding/无 border 并作为 `terminal.open()`、FitAddon 与 ResizeObserver 的唯一几何基准；这避免 FitAddon 把外层 padding 误算成可用行高后再被 `overflow:hidden` 裁掉最后一行。xterm viewport/scrollable remainder 与 canvas 继承同一个 `--terminal-background`，因此整数行之外的剩余高度不会显示成默认黑条；xterm 继续使用略大的 lineHeight，主题背景保持与页面基底协调；
- SessionWorkbench 是移动端可视几何的唯一 owner：无论 `visualViewport.scale` 是否为 1，整个工作台都跟随当前 VisualViewport 的 width/height/offset，因此 Safari 地址栏、双指缩放与软键盘出现/消失时 Header、终端和 keybar 仍留在真实可见区域；scale 只作为诊断值，不作为关闭布局修正的条件，PalmTTY 也不会写入、禁止或强制重置浏览器缩放；viewport meta 同时声明 `interactive-widget=resizes-content` 作为支持浏览器的渐进增强；
- 首次连接/重连会先 `fit` 得到浏览器实际 rows/cols，并把几何尺寸随 resume 一起提交；snapshot/replay 完成前冻结再次 fit，避免把服务端按旧尺寸序列化的终端状态写进新尺寸 xterm；TerminalView 只监听 terminal mount 的 ResizeObserver，Workbench/软键盘造成的可用高度变化先改变 mount，再由同一 ResizeObserver → FitAddon 路径传播；只有实际 rows/cols 变化才向 Worker 发送 resize；
- 恢复期间终端输入与长文本发送按钮保持不可用，尚未提交的长文本不会因为连接尚未就绪而被静默清空；
- PWA manifest 已补齐 PalmTTY 自有品牌资产：保留透明 `logo.png` 作为标准横版品牌图，提供 192/512 方形应用图标并接入 favicon、Apple touch icon 与安装 manifest；界面标题采用图标 + 主题文字而不是把固定颜色的位图字标强塞进所有主题，保证 Spectrum / Obsidian / Frosted 下的对比度与可访问性；
- 仅显式使用 `?viewportDebug=1` 时显示移动端 viewport 诊断覆盖层，输出 inner/client/visual viewport 尺寸、offset、scale、screen、DPR 和当前 focus element；它不输出终端内容、输入值或认证信息，用于真机 Safari 定位浏览器级 viewport 状态。

## 设计边界

- 长文本弹窗和附件路径插入最终仍然只作为终端输入发送，不建立 Codex/Antigravity 专用 API；PalmTTY 不保证所有 CLI 对裸路径使用同一种图片引用语法，厂商差异留在 CLI 层。
- Workspace 修改走独立持久化 API；Session 创建/重启不接收临时 cwd/shell/env。终端 Profile 发现只是受保护、有界的运行环境读取 API，不是通用命令执行接口。
- 目录选择器仍只读取目录名称/路径，不读取文件内容；会话工作台的文件浏览/预览是另一组独立受保护 API，使用相对 Workspace 路径并在 Agent 端做 canonical/symlink containment 检查，不能复用目录选择器绕开边界。
- Git 工作台只通过独立、有界、typed 的 Agent API 工作，不把 Git 命令塞进终端 WebSocket，也不进入 Session Worker。读取面使用 porcelain v2 status、diff/history/branches，禁止 external diff/textconv/fsmonitor；working-tree diff 会先解析该路径的 filter attribute，并在本次 diff 中中和 clean/process/required，避免查看动作触发内容过滤程序。写面只接受固定 operation union，不接受浏览器提供任意 argv。所有写操作携带当前 state token，破坏性丢弃还必须匹配刚加载的 diff snapshot；Web 默认关闭写按钮，用户在当前 Session workbench 确认“信任仓库”后才发送写请求，该确认在终端/Git/文件/附件页签切换间保留，离开 Session 页面后失效。PalmTTY 禁用 Git hooks、编辑器/credential 交互提示，但正常 Git filter 仍可能在 stage/switch/stash/pull 等语义中执行，因此这一确认是能力边界提示而不是沙箱。辅助子进程继续剔除 `PALMTTY_*` 控制环境命名空间以及单独配置的认证 token 环境变量。
- 浏览器丢失状态时以服务端 snapshot 为准。
- 终端依赖升级必须把 `terminal-stack.json`、两个 package manifest 与 frozen lockfile 作为一个变更集，并通过 `pnpm terminal:check`；浏览器 xterm 与 Worker headless 可以为了明确的浏览器修复暂时处在同一 major 的不同 minor/pre-release，但 Worker 端升级必须单独验证 serialize/replay/geometry recovery。
- `stopping` Session 可以继续被查看，但终端输入、resize 与长文本发送保持禁用，直到 Worker 报告最终退出。
- Service Worker 不缓存 API 或终端 WebSocket 数据。
- 终端输出只交给 xterm 渲染，不作为 HTML 注入页面。

## 后续可以做

- 自定义快捷键；
- 更好的移动端剪贴板；
- Git 写能力已经采用 typed operation + stale-state/diff-snapshot + 明确信任确认模型落地；后续如需 force push、interactive rebase/cherry-pick、reflog/submodule/LFS 管理，应继续逐项建模，不能退化成任意 Git argv API；文件编辑仍需单独设计并发修改、编码与原子写入；
- Codex 等 AI CLI 的状态提示，但保持 CLI 厂商无关。

## 你审查时重点看

手机体验优化不能绕开终端协议新增隐式高权限 API。Git/文件能力已经通过独立、有界 Workspace API 落地：Files 保持只读，Git 只开放 typed 写操作。继续增加更高级 Git 或文件写能力时仍必须单独审查权限、仓库 hooks/filters、并发写、symlink/路径逃逸与敏感环境变量继承。
