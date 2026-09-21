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
- Git 视图提供仓库分支、上游、ahead/behind、staged/unstaged/untracked 状态和有界文本 diff；当前刻意只读，不在 UI 中执行 stage/commit/push/pull；
- 文件视图以持久 Workspace 根目录为边界浏览目录和文件，提供 UTF-8 文本只读预览；二进制文件只显示状态，大文件预览在 512 KiB 截断；
- xterm.js；
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
- Git 工作台只通过独立的有界 Agent API 读取 status/diff；它不是终端 WebSocket 消息，也不进入 Session Worker。为避免浏览器查看操作触发仓库脚本，Git diff 禁止 external diff/textconv，status 禁用 fsmonitor；辅助子进程会剔除 `PALMTTY_*` 控制环境命名空间以及单独配置的认证 token 环境变量。
- 浏览器丢失状态时以服务端 snapshot 为准。
- `stopping` Session 可以继续被查看，但终端输入、resize 与长文本发送保持禁用，直到 Worker 报告最终退出。
- Service Worker 不缓存 API 或终端 WebSocket 数据。
- 终端输出只交给 xterm 渲染，不作为 HTML 注入页面。

## 后续可以做

- 自定义快捷键；
- 更好的移动端剪贴板；
- 如果真实使用确有需要，再设计受控 Git 写操作（stage/commit 等）与文件编辑；不能简单把任意 Git/文件写命令暴露成 Web API；
- Codex 等 AI CLI 的状态提示，但保持 CLI 厂商无关。

## 你审查时重点看

手机体验优化不能绕开终端协议新增隐式高权限 API。Git/文件能力已经通过独立的只读、有界 Workspace API 落地；继续增加写能力时必须单独审查权限、仓库 hooks/filters、symlink/路径逃逸与敏感环境变量继承。
