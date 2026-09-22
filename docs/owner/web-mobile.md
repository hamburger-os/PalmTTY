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

- “终端 / Git / 文件”三个一级视图，终端始终是核心视图；
- 切到 Git/文件时 Terminal 组件保持 mounted，xterm、WebSocket、`lastSeq` 与重连循环不被展示状态重建；隐藏时不传播 resize，切回终端再安全 `fit`；
- Git 视图已经升级为轻量 Source Control 工作台：显式显示“完整仓库”作用域、分支/上游/ahead-behind、冲突、staged/unstaged/untracked；diff 使用结构化 unified diff 行渲染并支持未跟踪文件预览；无选中修改时显示最近提交；支持 rename-aware 的单文件 stage/unstage、显式仓库级 stage-all/unstage-all、带 diff 快照校验的丢弃、commit、分支创建/切换、stash，以及非交互 fetch/pull/push；status 一旦被截断或解析不完整，所有写/remote 控件立即禁用；进入页面、窗口重新聚焦/回到前台和可见页低频轮询都会刷新状态；
- 文件视图以持久 Workspace 根目录为边界浏览目录和文件，提供 UTF-8 文本只读预览；二进制文件只显示状态，大文件预览在 512 KiB 截断；
- xterm.js；浏览器端 xterm/fit 由根目录 `terminal-stack.json` 精确锁定，当前浏览器栈使用包含上游触摸滚动修复的 xterm 6.1 beta，而 Worker 端 headless/serialize 暂时保持稳定 6.0/0.14，避免把移动端输入修复与 canonical snapshot/recovery 升级绑在一起；
- 手机单指在普通终端缓冲区纵向滑动由 PalmTTY 的 host-local touch adapter 接到 xterm 公共 `scrollLines` API：仅在 normal buffer 且未启用 mouse tracking 时接管，并在该终端节点内阻止浏览器页面滚动；alternate buffer 或启用 mouse tracking 时继续交给 xterm，自身不建立第二个 DOM 滚动层，也不增加 document 级全局 touch handler；会话工作台在显示期间固定到 viewport，避免 iOS 页面 rubber-band 与终端历史争抢手势；
- 自动重连状态；
- Esc、Tab、方向键、Ctrl+C、Ctrl+L；
- 可切换的 Ctrl / Alt 一次性修饰键；
- 适合粘贴、语音输入和 AI Prompt 的按需长文本弹窗；不再常驻聊天式发送栏，从而把垂直空间还给终端；
- 竖屏/横屏布局；
- Safe Area 处理；
- xterm 使用略大的 lineHeight 与终端底部内边距，避免最后一行字形下缘贴住/被底部工具栏视觉遮挡；炫彩流光主题的终端背景采用与页面基底更接近的深色值，避免形成突兀的纯黑视觉孤岛；
- 首次连接/重连会先 `fit` 得到浏览器实际 rows/cols，并把几何尺寸随 resume 一起提交；snapshot/replay 完成前冻结再次 fit，避免把服务端按旧尺寸序列化的终端状态写进新尺寸 xterm；
- 恢复期间终端输入与长文本发送按钮保持不可用，尚未提交的长文本不会因为连接尚未就绪而被静默清空；
- PWA manifest。

## 设计边界

- 长文本弹窗最终仍然把文本作为终端输入发送，不建立 Codex 专用 API。
- Workspace 修改走独立持久化 API；Session 创建/重启不接收临时 cwd/shell/env。终端 Profile 发现只是受保护、有界的运行环境读取 API，不是通用命令执行接口。
- 目录选择器仍只读取目录名称/路径，不读取文件内容；会话工作台的文件浏览/预览是另一组独立受保护 API，使用相对 Workspace 路径并在 Agent 端做 canonical/symlink containment 检查，不能复用目录选择器绕开边界。
- Git 工作台只通过独立、有界、typed 的 Agent API 工作，不把 Git 命令塞进终端 WebSocket，也不进入 Session Worker。读取面使用 porcelain v2 status、diff/history/branches，禁止 external diff/textconv/fsmonitor；working-tree diff 会先解析该路径的 filter attribute，并在本次 diff 中中和 clean/process/required，避免查看动作触发内容过滤程序。写面只接受固定 operation union，不接受浏览器提供任意 argv。所有写操作携带当前 state token，破坏性丢弃还必须匹配刚加载的 diff snapshot；Web 默认关闭写按钮，用户在当前 Session workbench 确认“信任仓库”后才发送写请求，该确认在终端/Git/文件页签切换间保留，离开 Session 页面后失效。PalmTTY 禁用 Git hooks、编辑器/credential 交互提示，但正常 Git filter 仍可能在 stage/switch/stash/pull 等语义中执行，因此这一确认是能力边界提示而不是沙箱。辅助子进程继续剔除 `PALMTTY_*` 控制环境命名空间以及单独配置的认证 token 环境变量。
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
