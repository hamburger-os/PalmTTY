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
- Workspace 弹窗只保留表单自身一个纵向滚动容器，避免 `dialog` 与表单同时滚动；
- Shell 参数提供按运行环境区分的示例快捷按钮；每行仍代表一个独立 argv；
- 启动命令下提供常用终端 Agent 快捷项，目前包括 Codex、Claude Code、Antigravity、Gemini CLI、OpenCode、Aider，点击只填写命令，不负责安装工具；
- 新建会话；
- 已运行会话列表；
- 会话状态和连接数；
- 重新进入或终止会话；
- 登录/退出；
- 中文 / English 语言切换并在浏览器本地保存偏好。

终端页提供：

- xterm.js；
- 自动重连状态；
- Esc、Tab、方向键、Ctrl+C、Ctrl+L；
- 可切换的 Ctrl / Alt 一次性修饰键；
- 适合粘贴和语音输入的多行 Composer；
- 竖屏/横屏布局；
- Safe Area 处理；
- xterm 使用略大的 lineHeight 与终端底部内边距，避免最后一行字形下缘贴住/被底部工具栏视觉遮挡；
- 首次连接/重连会先 `fit` 得到浏览器实际 rows/cols，并把几何尺寸随 resume 一起提交；snapshot/replay 完成前冻结再次 fit，避免把服务端按旧尺寸序列化的终端状态写进新尺寸 xterm；
- 恢复期间终端输入与发送按钮保持不可用，Composer 文本不会因为连接尚未就绪而被静默清空；
- PWA manifest。

## 设计边界

- Composer 最终仍然把文本作为终端输入发送，不建立 Codex 专用 API。
- Workspace 修改走独立持久化 API；Session 创建不接收临时 cwd/shell/env。
- 目录选择器只读取目录名称/路径，不读取文件内容；Host/WSL 浏览都由受保护的 Agent API 完成。
- 浏览器丢失状态时以服务端 snapshot 为准。
- Service Worker 不缓存 API 或终端 WebSocket 数据。
- 终端输出只交给 xterm 渲染，不作为 HTML 注入页面。

## 后续可以做

- 自定义快捷键；
- 更好的移动端剪贴板；
- Git diff/read-only 文件预览；
- Codex 等 AI CLI 的状态提示，但保持 CLI 厂商无关。

## 你审查时重点看

手机体验优化不能绕开终端协议新增隐式高权限 API；如果需要文件或 Git 能力，应先定义新的只读/受限边界。
