<!-- bilingual -->
# Security / 安全

## English

PalmTTY provides shell access with the privileges of the OS user running it. Treat compromise as workstation compromise.

### Required boundaries

- Run PalmTTY as a normal user, not Administrator/root.
- Default to loopback or a private overlay network.
- Non-loopback normal mode requires authentication, secure cookies and an exact Origin allowlist.
- Browser login uses a bootstrap secret sent only in a POST body, never in a URL.
- Successful login creates an in-memory HttpOnly, SameSite=Strict session cookie; Secure is required for normal non-loopback deployment.
- Authentication and Origin are separate controls.
- Browser requests can select only configured workspace IDs; they cannot submit arbitrary cwd, shell executable or environment values.
- Terminal I/O, login tokens, Worker secrets and workspace environment values are excluded from default logs.
- Login attempts, Session creation, terminal dimensions, input size, replay state, exited-session retention and socket backpressure are bounded.

### Session Worker boundary

Each terminal Session runs in an independent detached Worker.

- The Worker owns the PTY and reconnect state.
- The Agent can restart without terminating the Worker.
- Agent↔Worker IPC requires a per-session 256-bit secret.
- The Worker secret is delivered only through anonymous stdin during creation and never reaches the browser, argv or URL.
- The PalmTTY login-token environment variable is removed from both the Worker process environment and the PTY environment.
- Worker terminal input is independently limited to the same 64 KiB bound as browser input.
- IPC frames and queued socket bytes are bounded.
- Wrong Worker secrets are rejected before control commands are accepted.

Recovery files are local-user state. Unix runtime directories/files are tightened to 0700/0600. On Windows they live below the current user's application-data location and still require application-layer Worker-secret authentication.

Persisted Worker/Shell PIDs are diagnostic metadata only. PalmTTY does not kill a process merely because a stale record contains its PID; this avoids PID-reuse mistakes.

### Persistence boundary

A browser disconnect or Agent restart does not kill the live terminal. Agent login sessions themselves are still memory-only, so a user signs in again after Agent restart.

PalmTTY does not claim persistence across OS reboot, user logoff or Worker-process termination.

### Recommended deployment

Prefer a private HTTPS entry point such as Tailscale Serve, or an authenticated HTTPS reverse proxy such as Caddy/QNAP. Keep the PalmTTY upstream port private.

## 中文

PalmTTY 会以运行它的 OS 用户权限提供 Shell，应按“开发电脑账号被接管”的风险级别设计。

### 必须保持的边界

- 以普通用户运行，不默认提权。
- 默认仅监听 loopback，或通过私有组网访问。
- 非 loopback 正常模式要求认证、Secure Cookie 和精确 Origin 白名单。
- 浏览器登录 secret 只通过 POST body 提交，不进入 URL。
- 登录 Cookie 使用 HttpOnly、SameSite=Strict；正常非 loopback 部署要求 Secure。
- 认证与 Origin 是独立控制。
- 浏览器只能选择预配置 workspace ID，不能提交任意 cwd、Shell 或环境变量。
- 默认日志不记录终端 I/O、登录 token、Worker secret 或 workspace 环境变量。
- 登录、Session 创建、终端尺寸、输入、replay、退出保留和 socket backlog 都有资源上限。

### Session Worker 安全边界

每个终端 Session 运行在独立 detached Worker 中。

- PTY 与恢复状态由 Worker 持有；
- Agent 重启不会终止 Worker；
- Agent↔Worker IPC 必须使用每 Session 独立的 256-bit secret；
- Worker secret 创建时只经匿名 stdin 传入，不进入浏览器、argv 或 URL；
- PalmTTY 登录 token 对应环境变量会从 Worker 与 PTY 环境中移除；
- Worker IPC 的终端输入再次限制为 64 KiB；
- IPC frame 与 socket 积压均有硬上限；
- 错误 Worker secret 在接受任何控制命令前就会被拒绝。

Recovery 文件属于当前用户本地状态。Unix 使用 0700/0600；Windows 放在当前用户应用数据目录，并继续要求 Worker secret 应用层认证。

Worker/Shell PID 只用于诊断。PalmTTY 不会因为 stale record 记录了某个 PID 就直接 kill 该进程，以避免 PID 复用导致误杀。

### 持久化边界

浏览器断线或 Agent 重启不会杀掉活终端。登录 Session 仍只保存在 Agent 内存，所以 Agent 重启后需要重新登录。

当前不承诺 OS reboot、用户注销或 Worker 进程终止后的持久化。

### 推荐部署

优先使用私有 HTTPS 入口，例如 Tailscale Serve；或使用 Caddy/QNAP 等可信 HTTPS 反向代理。PalmTTY 上游端口保持私有。
