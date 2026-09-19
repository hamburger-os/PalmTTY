# Agent 服务端

## 目标

PalmTTY Agent 是运行在开发电脑上的唯一 Web 服务入口，负责：

- 提供 HTTP 与 WebSocket API；
- 认证和 Origin 安全检查；
- 管理本机终端会话；
- 托管编译后的手机端 PWA；
- 把浏览器终端连接到本机 PowerShell/ConPTY。

## 当前架构

Agent 使用 Node.js + Fastify。终端进程通过 node-pty 创建，在 Windows 11 上使用 ConPTY。

```text
浏览器
  │
HTTP / WebSocket
  │
PalmTTY Agent
  ├─ Auth
  ├─ Workspace 白名单
  ├─ Session Manager
  ├─ 终端状态镜像
  └─ 静态 Web
        │
     node-pty
        │
      ConPTY
        │
   PowerShell 7
```

## 重要边界

- Agent 默认不应以管理员身份运行。
- 浏览器只能选择配置好的 workspace，不能远程指定任意目录或 Shell。
- Agent 不理解 Codex 的内部协议；Codex 只是运行在终端里的普通 CLI。
- 当前所有 PTY 都由 Agent 进程持有，所以 Agent 重启会结束这些会话。
- 默认日志不得包含终端输入、输出、token 或 workspace 环境变量。

## 你审查时重点看

- 是否有人把文件管理、任意命令 API、提权等能力绕过终端边界直接加进 Agent；
- 是否把公网安全检查为了“方便调试”而放宽；
- 是否错误宣称 Agent 重启后终端还能继续存在。
