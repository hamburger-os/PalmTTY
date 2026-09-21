# Agent 服务端

## 目标

PalmTTY Agent 是开发电脑上的 Web/API 控制面，负责：

- 提供 HTTP 与 WebSocket API；
- 登录认证和 Origin 安全检查；
- 管理当前用户的持久化 workspace 目录与运行时验证；
- 为 Workspace 编辑器提供受认证 + 精确 Origin 保护的只读目录浏览与统一终端配置发现；Host 侧只探测已知 Shell，WSL 侧只枚举已注册发行版，不通过扫描动作启动发行版；
- 为 Session Workbench 提供独立的只读 Files/Git HTTP API：Files 限定在 Workspace 根目录，Git 只暴露 status/diff；两者都与 terminal WebSocket/Worker 数据面分离；
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
  ├─ Workspace Store / Runtime Adapters
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

目录浏览与 Workspace 持久化分离：浏览接口只返回目录，不返回文件内容；Host 默认从当前用户 home 开始并可浏览可访问盘符，WSL 使用固定 shell 脚本并把用户路径作为独立 argv 传入，不拼接到命令字符串。目录结果最多返回 512 项，WSL 子进程另有输出大小与超时上限，并对浏览请求单独限流。

Session Workbench 的文件能力不修改上述目录选择器语义，而是使用单独 API：浏览器只提交规范化 Workspace 相对路径；Host 通过 `realpath` 检查 symlink 后的真实路径仍在根目录内，WSL 在发行版内解析 physical path 并再次检查根目录前缀。文件列表最多 512 项；UTF-8 预览最多 512 KiB，二进制文件不回传可渲染文本。

Git 工作台同样使用单独 API，以 Workspace cwd 所在仓库为上下文，只运行有界的 branch/tracking/status 与 staged/working-tree diff。命令全部使用结构化 argv，diff 禁止 external diff/textconv，status 禁用 fsmonitor；当前不提供 stage/commit/push/pull，因此“查看状态”不会引入新的 Git 写入面。所有 WSL/Git 辅助子进程在启动前剔除 `PALMTTY_*` 控制环境命名空间以及单独配置的认证 token 环境变量。

`pnpm dev` 会在 preflight 成功后由根启动器为当前私有 LAN 地址生成 5173 的精确 development Origins，并只在 `--development` Agent 中合并；Agent 自身监听地址仍完全来自正式 config，不因 Vite 的 LAN 监听而改成非 loopback。Windows development 还默认开启不含命令/环境内容的 Worker/PTTY spawn phase trace，用于定位真实桌面上仍可能出现的短暂 console flash。

Agent 启动前的 runtime preflight 只处理认证环境、外部暴露规则和 Agent TCP host/port 可绑定性，不再遍历 workspace。Workspace 是独立的 per-user 持久化状态；新建/修改时通过认证 + 精确 Origin 保护的 API 验证，创建 Session 时再次验证。Agent 启动后异步探测一次 runtime capabilities 并在本进程生命周期内复用结果，避免每次 Web 查询都重复启动 WSL 探测进程；该探测不是创建 Host workspace 的前置条件。Host runtime 会把 Shell 解析为绝对启动路径；Windows 当前用户 `%LOCALAPPDATA%\Microsoft\WindowsApps` 下的 App Execution Alias 有专门处理。每次创建或重启 Windows 终端时还会重新读取 Machine/User 环境，重新组合最新 PATH，再叠加 Workspace 的有界环境变量，所以安装 CLI 后不需要重启整个 Agent 才能让新 PTY 看见新的 PATH。WSL runtime 只在 Windows Agent 上启用，解析 `wsl.exe`，并把发行版、Linux cwd、Shell/args 作为结构化参数传入；Workspace 环境变量通过 `WSLENV` 名称列表转发。只有规范化后的运行规格才进入 Worker bootstrap。

创建 Session 时 Agent：

1. 按 workspace ID 从持久化 store 读取定义并再次运行 runtime adapter 验证，生成 cwd、绝对 executable 与 args；
2. 生成随机 Session ID、IPC endpoint ID 与 256-bit Worker secret；
3. detached 启动 Worker，并通过一次性匿名 stdin 发送 bootstrap；
4. Worker 完成 IPC 监听、secret/record 持久化后返回 READY，但此时仍处于“未接管创建租约”；
5. Agent 通过 Worker protocol + secret 认证，读取 recovery record，再发送显式 `adopt`；`adopt` 是幂等提交操作，如果响应丢失，Agent 会重新建立 IPC 并重复提交；
6. adoption 得到确认后 Worker 生命周期才正式独立于创建它的 Agent；
7. 如果 adoption 从未提交且 Agent 失败或消失，Worker 的短创建租约到期后会自行杀 PTY、清理 recovery state 并退出，不需要额外 abort 命令，也不依赖持久化 PID 做回滚。

`PALMTTY_*` 整个控制环境命名空间以及单独配置的认证 token 环境变量，在 Worker bootstrap 前从规范化 Workspace 环境剔除，并从 Worker 进程环境删除；用户 PTY 只接收清理后的 Workspace 环境。

## Session 生命周期 API

Session 创建仍是 `POST /api/v1/sessions`。生命周期修改不再复用一个含义模糊的 DELETE：

- `POST /api/v1/sessions/:id/terminate`：请求 Worker 终止 PTY，状态先进入 `stopping`，最终由 PTY exit 事件推进为 `exited`；重复调用是幂等的。
- `POST /api/v1/sessions/:id/restart`：终止当前 PTY，等待进入 terminal state，再 retirement 旧 Session，并按同一 workspace ID 与原 rows/cols 创建一个新的 Session。它会产生新的 Session ID/终端历史，并重新解析最新 Workspace 与宿主环境。
- `DELETE /api/v1/sessions/:id`：只删除已经 `exited/failed` 的 retained Session。活动或 `stopping` Session 返回冲突；成功时由 Worker 通过 authenticated IPC 执行 retirement 和 recovery-state 清理。
- Session lifecycle mutation 使用独立限流，不与创建或 workspace mutation 共用计数器。

这样 HTTP 资源语义与 UI 一致：Terminate 是进程动作，Delete/Clear 是 retained resource disposal。

## 重要边界

- Agent/Worker 默认都不应以管理员身份运行。
- 浏览器可以显式管理持久化 workspace 的 cwd/runtime/Shell、有界环境变量与启动命令，但该能力必须经过认证与精确 Origin；Session 创建/重启接口本身不接受临时 cwd/shell/env 覆盖。Workspace 环境变量是本机持久化配置，不是 secret vault。
- Agent 不理解 Codex 的内部协议；Codex 只是终端里的普通 CLI。Git/Files Workbench 也不是 Session Worker 插件，它们只是受限的 Workspace 检查服务。
- Worker secret 不进入浏览器、命令行、URL、普通日志或 PTY 环境。
- 持久化 PID 只用于诊断，不允许直接作为 kill authority；PID 可能被系统复用。
- Agent 暂时无法连接 Worker 不是删除其 recovery capability 的充分条件；控制面故障不能被放大成 PTY 生命周期故障。
- 默认日志不得包含终端输入、输出、token、Worker secret 或 workspace 环境变量。

## 你审查时重点看

- 是否重新把 PTY 或 xterm/replay canonical state 放回 Agent；
- Agent 关闭路径是否误杀 Worker；
- Worker bootstrap/secret 是否泄漏到 argv、env、URL 或日志；
- 是否按记录的 PID 直接杀进程；
- Workspace CRUD 是否仍是显式持久化修改面，而不是把 cwd/shell/env 重新塞进 Session 创建请求；
- IPC 与浏览器 backpressure 是否仍有硬上限。
