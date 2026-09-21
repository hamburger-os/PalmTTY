# Agent 服务端

## 目标

PalmTTY Agent 是开发电脑上的 Web/API 控制面，负责：

- 提供 HTTP 与 WebSocket API；
- 登录认证和 Origin 安全检查；
- 管理本机 workspace 白名单；
- 创建、发现并认证独立 Session Worker；
- 把浏览器 WebSocket 转发到对应 Worker；
- 托管编译后的手机端 PWA。

Agent 不再拥有 PTY，也不保存 canonical terminal state。

## 当前架构

~~~text
浏览器
  │ HTTPS / WSS
  ▼
PalmTTY Agent
  ├─ Auth / Origin
  ├─ Workspace 白名单
  ├─ Worker Registry
  └─ 静态 Web
        │
        │ 本机认证 IPC
        ▼
  Session Worker（每个 Session 一个）
  ├─ node-pty / ConPTY
  ├─ headless xterm
  ├─ seq + replay
  └─ exited retention
        │
     PowerShell 7
        │
   Codex / Git / ...
~~~

Windows 使用 Named Pipe；当前其他 CI 平台使用 Unix domain socket。IPC 的控制权限由每个 Session 独立的高熵 secret 认证。

## Agent 生命周期

Agent 正常关闭、升级或异常退出时：

- 浏览器连接会断开；
- Worker 控制连接会断开；
- Worker 与 PTY 不退出；
- 新 Agent 启动后读取 recovery metadata 和私有 secret；
- 新 Agent 重新认证同一 Worker；
- 浏览器重新登录并连接原 Session 后，通过原有 replay/snapshot 机制恢复。

登录 Cookie 仍属于 Agent 内存状态，所以 Agent 重启后需要重新登录。终端本身不会因此结束。

## Worker 创建

Agent 启动前先执行 runtime preflight：认证环境与外部暴露规则必须有效，所有 workspace `cwd` 必须是真实目录，Shell 必须能解析为绝对启动路径。Windows 当前用户 `%LOCALAPPDATA%\\Microsoft\\WindowsApps` 下的 App Execution Alias 采用专门识别逻辑，以兼容 Store/MSIX PowerShell 的 reparse point；其他可执行路径继续执行严格文件校验。解析后的规范化运行规格才会进入 Worker bootstrap，因此 PTY 启动不依赖 node-pty 自己的 PATH 查找。

创建 Session 时 Agent：

1. 从已经 preflight 的 workspace runtime spec 取得 cwd、绝对 Shell、args、env；
2. 生成随机 Session ID、IPC endpoint ID 与 256-bit Worker secret；
3. detached 启动 Worker，并通过一次性匿名 stdin 发送 bootstrap；
4. Worker 完成 IPC 监听、secret/record 持久化后返回 READY，但此时仍处于“未接管创建租约”；
5. Agent 通过 Worker protocol + secret 认证，读取 recovery record，再发送显式 `adopt`；`adopt` 是幂等提交操作，如果响应丢失，Agent 会重新建立 IPC 并重复提交；
6. adoption 得到确认后 Worker 生命周期才正式独立于创建它的 Agent；
7. 如果 adoption 从未提交且 Agent 失败或消失，Worker 的短创建租约到期后会自行杀 PTY、清理 recovery state 并退出，不需要额外 abort 命令，也不依赖持久化 PID 做回滚。

PalmTTY 登录 token 对应的环境变量会从 Worker 环境和最终 PTY 环境中移除。

## 重要边界

- Agent/Worker 默认都不应以管理员身份运行。
- 浏览器只能选择配置好的 workspace，不能远程指定任意目录、Shell 或环境变量。
- Agent 不理解 Codex 的内部协议；Codex 只是终端里的普通 CLI。
- Worker secret 不进入浏览器、命令行、URL、普通日志或 PTY 环境。
- 持久化 PID 只用于诊断，不允许直接作为 kill authority；PID 可能被系统复用。
- Agent 暂时无法连接 Worker 不是删除其 recovery capability 的充分条件；控制面故障不能被放大成 PTY 生命周期故障。
- 默认日志不得包含终端输入、输出、token、Worker secret 或 workspace 环境变量。

## 你审查时重点看

- 是否重新把 PTY 或 xterm/replay canonical state 放回 Agent；
- Agent 关闭路径是否误杀 Worker；
- Worker bootstrap/secret 是否泄漏到 argv、env、URL 或日志；
- 是否按记录的 PID 直接杀进程；
- 是否扩大浏览器的 cwd/shell/env 权限；
- IPC 与浏览器 backpressure 是否仍有硬上限。
