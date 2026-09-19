# 手机端 Web/PWA

## 目标

手机端不是把桌面终端简单缩小，而是把“远程控制 AI CLI”作为主要交互场景。

## 当前界面

首页提供：

- Workspace 列表；
- 新建会话；
- 已运行会话列表；
- 会话状态和连接数；
- 重新进入或终止会话；
- 登录/退出。

终端页提供：

- xterm.js；
- 自动重连状态；
- Esc、Tab、方向键、Ctrl+C、Ctrl+L；
- 可切换的 Ctrl / Alt 一次性修饰键；
- 适合粘贴和语音输入的多行 Composer；
- 竖屏/横屏布局；
- Safe Area 处理；
- PWA manifest。

## 设计边界

- Composer 最终仍然把文本作为终端输入发送，不建立 Codex 专用 API。
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
