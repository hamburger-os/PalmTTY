<!-- bilingual -->
# Security / 安全

## English

PalmTTY provides shell access with the privileges of the OS user running it. Treat compromise as workstation compromise.

### Required boundaries

- Run PalmTTY as a normal user, not Administrator/root.
- Production/normal Agent configuration defaults to loopback or a private overlay network. `pnpm dev` is intentionally different: Vite listens on `0.0.0.0:5173` for private-LAN testing while the Agent stays on its configured endpoint (the example remains loopback).
- The development launcher dynamically adds only the workstation's detected private/overlay IPv4 `http://<address>:5173` Origins as exact in-memory Origins. It does not persist them, use wildcard Origin matching, or make production Agent startup non-loopback.
- Non-loopback normal Agent mode requires authentication, secure cookies and an exact Origin allowlist.
- Browser login uses a bootstrap secret sent only in a POST body, never in a URL.
- Successful login creates an in-memory HttpOnly, SameSite=Strict session cookie; Secure is required for normal non-loopback deployment.
- Authentication and Origin are separate controls. The LAN Vite proxy does not rewrite an arbitrary browser Origin into a trusted one; requests still have to match the generated exact development Origin and authenticate.
- Workspace management is an explicit authenticated, exact-Origin-protected mutation surface. The directory picker and terminal-profile discovery endpoint are separate authenticated + exact-Origin bounded inspection APIs. Profile discovery checks only known Host shells and enumerates registered WSL distributions without starting them; it does not expose file contents or arbitrary command execution.
- Session-workbench Files/Git inspection uses separate authenticated + exact-Origin APIs rather than the terminal WebSocket. Files accepts canonical Workspace-relative paths, contains Host/WSL symlinks inside the persisted Workspace root, limits directory entries and caps UTF-8 preview at 512 KiB. Git is read-only status/diff, bounds process output/time, disables external diff/textconv/fsmonitor execution, and strips the reserved `PALMTTY_*` control namespace plus any separately configured login-token variable from helper subprocesses.
- The browser may persist cwd/runtime/shell, a bounded workspace environment map, and startup input. Session creation and restart do not accept ad-hoc cwd/shell/environment overrides; they resolve the persisted workspace authority by ID.
- Workspace create/update validates the selected runtime. Host shells are resolved to absolute executables. On Windows, each new/restarted Host terminal refreshes current Machine/User environment values before applying workspace overrides. WSL launch data is passed as structured argv, and configured workspace variable names are forwarded with `WSLENV`. Session creation/restart validates the stored workspace again before Worker creation.
- Workspace environment values are local persistent configuration and may be sensitive, but PalmTTY does not treat the workspace catalog as a secret vault. The `PALMTTY_*` namespace plus any separately configured login-token variable is reserved and rejected from Workspace environment mutations.
- Terminal I/O, login tokens, Worker secrets and workspace environment values are excluded from default logs.
- Login attempts, Session creation/lifecycle mutations, directory/profile/workbench inspection, terminal dimensions, input size, replay state, exited-session retention and socket backpressure are bounded.

### Session Worker boundary

Each terminal Session runs in an independent detached Worker.

- The Worker owns the PTY and reconnect state.
- The Agent can restart without terminating the Worker.
- Agent↔Worker IPC requires a per-session 256-bit secret.
- The Worker secret is delivered only through anonymous stdin during creation and never reaches the browser, argv or URL.
- the entire `PALMTTY_*` control namespace plus any separately configured login-token variable is reserved from Workspace mutation and removed before Worker bootstrap/from the Worker process environment so they do not leak into the user shell.
- Worker terminal input is independently limited to the same 64 KiB bound as browser input.
- IPC frames and queued socket bytes are bounded.
- Wrong Worker secrets are rejected before control commands are accepted.
- Terminate and retained-session retirement are authenticated Worker controls. Retirement is accepted only after the Session is exited/failed, so the Agent cannot delete recovery state behind a live Worker's back.

Recovery files are local-user state. Unix runtime directories/files are tightened to 0700/0600. On Windows they live below the current user's application-data location and still require application-layer Worker-secret authentication.

Persisted Worker/Shell PIDs are diagnostic metadata only. PalmTTY does not kill a process merely because a stale record contains its PID; this avoids PID-reuse mistakes. Likewise, an IPC connection failure alone does not authorize deletion of potentially-live recovery state. A Worker owns its recovery capability and republishes missing artifacts; conflicting record/secret ownership fails closed. Session creation is transactional: READY does not make a Worker durable. The authenticated `adopt` command is idempotent, so a lost response is retried over a fresh IPC connection before creation is considered failed. A Worker that is never adopted remains under a short creation lease and self-terminates its PTY plus recovery state if the creator disappears. No separate abort command or persisted PID is used as rollback authority.

### Persistence boundary

A browser disconnect or Agent restart does not kill the live terminal. Agent login sessions themselves are still memory-only, so a user signs in again after Agent restart.

PalmTTY does not claim persistence across OS reboot, user logoff or Worker-process termination.

### Recommended deployment

Prefer a private HTTPS entry point such as Tailscale Serve, or an authenticated HTTPS reverse proxy such as Caddy/QNAP. Keep the PalmTTY upstream port private.

## 中文

PalmTTY 会以运行它的 OS 用户权限提供 Shell，应按“开发电脑账号被接管”的风险级别设计。

### 必须保持的边界

- 以普通用户运行，不默认提权。
- 生产/正常 Agent 默认仍只监听 loopback，或通过私有组网访问。`pnpm dev` 是单独的开发拓扑：Vite 默认监听 `0.0.0.0:5173` 供私有 LAN 测试，但 Agent 仍使用配置中的 endpoint（示例仍是 loopback）。
- 开发启动器只把当前机器检测到的私有/overlay IPv4 对应 `http://<address>:5173` 作为精确 Origin 临时加入内存 allowlist；不持久化、不使用 Origin 通配，也不把 production Agent 改成默认非 loopback。
- 非 loopback 正常 Agent 模式要求认证、Secure Cookie 和精确 Origin 白名单。
- 浏览器登录 secret 只通过 POST body 提交，不进入 URL。
- 登录 Cookie 使用 HttpOnly、SameSite=Strict；正常非 loopback 部署要求 Secure。
- 认证与 Origin 是独立控制。LAN Vite 代理不会把任意浏览器 Origin 改写成可信 Origin，请求仍必须精确匹配自动生成的 development Origin 并通过认证。
- Workspace 目录选择器与终端 Profile 发现使用独立的“已认证 + 精确 Origin”有界 API；前者只返回目录名称/路径，后者只探测已知 Host Shell 并枚举已注册 WSL 发行版，不启动发行版，也不提供文件内容或任意命令执行。
- Session Workbench 的 Files/Git 也使用独立“已认证 + 精确 Origin”API，不扩展终端 WebSocket。Files 只接收规范化 Workspace 相对路径，Host/WSL 都会把 symlink 约束在持久 Workspace 根目录内，并限制目录项与 512 KiB UTF-8 预览。Git 当前只读 status/diff，限制子进程输出/时间，禁用 external diff/textconv/fsmonitor，并从辅助进程环境剔除配置的 PalmTTY 登录 token 变量。
- Workspace 管理是显式的高权限修改面，可以持久化 cwd、运行环境、Shell、有界环境变量与启动输入；真正创建或重启 Session 时不接受临时 cwd/shell/env 覆盖，而是按 workspace ID 解析持久化配置。
- 新建/修改 workspace 时会验证运行目标；Host Shell 解析为绝对可执行文件。Windows 每个新建/重启终端会重新读取 Machine/User 环境后再应用 Workspace environment；WSL 参数按结构化 argv 传递，并通过 `WSLENV` 转发配置变量名；创建/重启 Session 前还会再次验证持久化 workspace。
- Workspace environment 是本机持久化配置，值可能敏感，但 PalmTTY 不把 Workspace 目录当作密钥保险箱。`PALMTTY_*` 命名空间以及单独配置的认证 token 环境变量属于保留项，Workspace mutation 会直接拒绝。
- 默认日志不记录终端 I/O、登录 token、Worker secret 或 workspace 环境变量。
- 登录、Session 创建/生命周期修改、目录/Profile/Workbench 检查、终端尺寸、输入、replay、退出保留和 socket backlog 都有资源上限。

### Session Worker 安全边界

每个终端 Session 运行在独立 detached Worker 中。

- PTY 与恢复状态由 Worker 持有；
- Agent 重启不会终止 Worker；
- Agent↔Worker IPC 必须使用每 Session 独立的 256-bit secret；
- Worker secret 创建时只经匿名 stdin 传入，不进入浏览器、argv 或 URL；
- `PALMTTY_*` 整个控制环境命名空间以及单独配置的认证 token 环境变量属于 Workspace 保留项，并会在 Worker bootstrap 前从规范化 Workspace 环境剔除、从 Worker 进程环境删除，避免泄漏到用户 Shell；
- Worker IPC 的终端输入再次限制为 64 KiB；
- IPC frame 与 socket 积压均有硬上限；
- 错误 Worker secret 在接受任何控制命令前就会被拒绝。
- “终止”和 retained-session retirement 都属于认证后的 Worker 控制；只有 `exited/failed` 会话可以 retirement，Agent 不能绕过活 Worker 直接删 recovery state。

Recovery 文件属于当前用户本地状态。Unix 使用 0700/0600；Windows 放在当前用户应用数据目录，并继续要求 Worker secret 应用层认证。

Worker/Shell PID 只用于诊断。PalmTTY 不会因为 stale record 记录了某个 PID 就直接 kill 该进程，以避免 PID 复用导致误杀；同样，IPC 暂时连接失败本身也不构成删除可能仍存活 Worker recovery state 的权限。Recovery capability 由 Worker 自己拥有，缺失文件会由 Worker 重新发布；record/secret 被其他内容替换时则 fail closed。Session 创建采用事务式 adoption：Worker 返回 READY 后仍不算持久会话；authenticated `adopt` 是幂等提交操作，响应丢失时会通过新的 IPC 连接安全重试。只有 adoption 得到确认后才返回创建成功；如果 adoption 从未提交且创建者消失，Worker 会在短创建租约到期后自行终止 PTY 并清理 recovery state，不需要独立 abort 命令，也不使用持久化 PID 做回滚。

### 持久化边界

浏览器断线或 Agent 重启不会杀掉活终端。登录 Session 仍只保存在 Agent 内存，所以 Agent 重启后需要重新登录。

当前不承诺 OS reboot、用户注销或 Worker 进程终止后的持久化。

### 推荐部署

优先使用私有 HTTPS 入口，例如 Tailscale Serve；或使用 Caddy/QNAP 等可信 HTTPS 反向代理。PalmTTY 上游端口保持私有。
