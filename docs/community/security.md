<!-- bilingual -->
# Security / 安全

## English

PalmTTY provides shell access with the privileges of the OS user running it. Treat compromise as workstation compromise.

### Required boundaries

- Run PalmTTY as a normal user, not Administrator/root.
- Production/normal Agent uses an explicit exposure profile. `local` is the default and binds loopback; `lan` is explicit authenticated private/overlay HTTP; `reverseProxy` derives Secure cookies from explicit HTTPS browser Origins while allowing a private HTTP upstream; `https` terminates TLS in the Agent from configured certificate/key files.
- The development launcher dynamically adds only the workstation's detected private/overlay IPv4 `http://<address>:5173` Origins as exact runtime Origins. It does not persist them, use wildcard Origin matching, or change the configured production exposure profile.
- `lan` requires authentication, rejects non-private client source addresses before routing, and derives exact private/overlay HTTP Origins automatically. Origin remains a browser boundary rather than a substitute for the source-address gate. `reverseProxy` and `https` require authentication plus explicit HTTPS Origins; Secure-cookie behavior is derived from those modes rather than configured independently.
- Browser login uses a bootstrap secret sent only in a POST body, never in a URL.
- Successful login creates an in-memory HttpOnly, SameSite=Strict session cookie. Secure is derived automatically for `reverseProxy` and `https`; `local`/`lan` use non-Secure cookies because they are HTTP profiles.
- Authentication and Origin are separate controls. The LAN Vite proxy does not rewrite an arbitrary browser Origin into a trusted one; requests still have to match the generated exact development Origin and authenticate.
- Workspace management is an explicit authenticated, exact-Origin-protected mutation surface. The directory picker and terminal-profile discovery endpoint are separate authenticated + exact-Origin bounded inspection APIs. Profile discovery checks only known Host shells and enumerates registered WSL distributions without starting them; it does not expose file contents or arbitrary command execution.
- Session-workbench Files/Git use separate authenticated + exact-Origin APIs rather than the terminal WebSocket. Files accepts canonical Workspace-relative paths, contains Host/WSL symlinks inside the persisted Workspace root, limits directory entries and caps UTF-8 preview at 512 KiB. Git explicitly operates on the complete repository containing the Workspace cwd and reports that scope. Reads use porcelain-v2 status plus bounded diff/history/branch queries and disable external diff/textconv/fsmonitor plus log signature-helper execution. Working-tree diff also resolves the selected path's `filter` attribute and overrides that driver's clean/process commands plus `required` for the diff command, so inspection does not execute repository-configured content filters; filter names that cannot be neutralized safely are rejected. Writes accept only typed stage/unstage/restore/commit/branch/stash/fetch/pull/push operations. They are serialized per resolved repository, including across multiple Workspaces that share one repository; incomplete/truncated status is rejected as write authority; requests require the current state token and explicit trusted-repository acknowledgement, and destructive restore verifies the viewed diff snapshot. Hooks, editors and interactive credential prompts are disabled; Git config/exec/SSH/askpass override environment variables are stripped; remote transport is allowlisted to http/https/ssh/git and denies ext/file/unknown protocols. Normal Git filters and trusted host/repository Git configuration may still execute under standard Git semantics.
- The browser may persist cwd/runtime/shell, a bounded workspace environment map, and startup input. Session creation and restart do not accept ad-hoc cwd/shell/environment overrides; they resolve the persisted workspace authority by ID.
- Workspace create/update validates the selected runtime. Host shells are resolved to absolute executables. On Windows, each new/restarted Host terminal refreshes current Machine/User environment values before applying workspace overrides. WSL launch data is passed as structured argv, and configured workspace variable names are forwarded with `WSLENV`. Session creation/restart validates the stored workspace again before Worker creation.
- Workspace environment values are local persistent configuration and may be sensitive, but PalmTTY does not treat the workspace catalog as a secret vault. The `PALMTTY_*` namespace plus any separately configured login-token variable is reserved and rejected from Workspace environment mutations.
- Terminal I/O, login tokens, Worker secrets and workspace environment values are excluded from default logs.
- Login attempts, Session creation/lifecycle mutations, directory/profile/workbench reads, Git mutations, Git remote operations, terminal dimensions, input size, replay state, exited-session retention and socket backpressure are bounded.

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

### Autostart boundary

PalmTTY autostart is always current-user scoped: Windows Task Scheduler uses an interactive user token and least privilege; Linux uses `systemd --user`. Windows installation compiles a small GUI-subsystem host into the current user's local application data and Task Scheduler launches that executable directly. The host starts the Node Agent with no console, places it in a kill-on-close Job Object and allows child processes to break away, so task termination supervises the Agent while independent Session Workers keep their separate lifetime. PowerShell is used only during installation to compile the host and is not part of the long-lived runtime chain. This does not change the user token or elevation boundary. PalmTTY does not install a LocalSystem/root service or silently enable Linux lingering.

The optional Agent `--env-file` keeps bootstrap secret **values** out of task/unit argv. Its strict parser does not perform shell expansion. Keep real env files outside the repository and readable only by the PalmTTY user; Linux autostart installation rejects group/world-readable files. Stopping/restarting the Linux Agent service uses `KillMode=process` so independent Session Workers are not reclassified as ordinary service children. This still does not provide PTY survival across OS reboot.

### Recommended deployment

Prefer a private HTTPS entry point such as Tailscale Serve, or an authenticated HTTPS reverse proxy such as Caddy/QNAP. Keep the PalmTTY upstream port private.

## 中文

PalmTTY 会以运行它的 OS 用户权限提供 Shell，应按“开发电脑账号被接管”的风险级别设计。

### 必须保持的边界

- 以普通用户运行，不默认提权。
- 生产/正常 Agent 使用显式 exposure profile：`local` 默认只监听 loopback；`lan` 是显式、已认证但未加密的私有/overlay HTTP，会在路由前拒绝非私有来源地址，并自动只接受当前私有/overlay IPv4 精确 Origin；`reverseProxy` 从明确的 HTTPS 浏览器 Origin 自动派生 Secure Cookie，同时允许私有 HTTP upstream；`https` 则由 Agent 自己读取证书/私钥终止 TLS。
- 开发启动器只把当前机器检测到的私有/overlay IPv4 对应 `http://<address>:5173` 作为精确 Origin 临时加入内存 allowlist；不持久化、不使用 Origin 通配，也不把 production Agent 改成默认非 loopback。
- `lan` 要求认证 + 私有来源地址 + 精确私有 Origin，但因其是 HTTP 模式不会设置 Secure Cookie；`reverseProxy` / `https` 则要求认证、显式 HTTPS Origin，并自动使用 Secure Cookie。
- 浏览器登录 secret 只通过 POST body 提交，不进入 URL。
- 登录 Cookie 使用 HttpOnly、SameSite=Strict；正常非 loopback 部署要求 Secure。
- 认证与 Origin 是独立控制。LAN Vite 代理不会把任意浏览器 Origin 改写成可信 Origin，请求仍必须精确匹配自动生成的 development Origin 并通过认证。
- Workspace 目录选择器与终端 Profile 发现使用独立的“已认证 + 精确 Origin”有界 API；前者只返回目录名称/路径，后者只探测已知 Host Shell 并枚举已注册 WSL 发行版，不启动发行版，也不提供文件内容或任意命令执行。
- Session Workbench 的 Files/Git 也使用独立“已认证 + 精确 Origin”API，不扩展终端 WebSocket。Files 只接收规范化 Workspace 相对路径，Host/WSL 都会把 symlink 约束在持久 Workspace 根目录内，并限制目录项与 512 KiB UTF-8 预览。Git 明确操作“包含 Workspace cwd 的完整仓库”并返回该 scope；读取使用 porcelain v2 status 与有界 diff/history/branches，禁用 external diff/textconv/fsmonitor。working-tree diff 还会先解析该路径的 `filter` attribute，并在本次 diff 命令中清空对应 driver 的 clean/process、将 required 设为 false，避免只读查看触发仓库配置的内容过滤程序；无法安全中和的 filter 名称会被拒绝。写入只允许 typed stage/unstage/restore/commit/branch/stash/fetch/pull/push；按“已解析 Git 仓库”而不是 Workspace ID 串行执行，多个 Workspace 指向同一仓库时也共享写队列；truncated/不完整 status 不能作为写 authority；请求必须带当前 state token 和可信仓库确认，破坏性 restore 还校验已查看 diff snapshot。Git hooks、编辑器和交互式 credential prompt 被禁用，Git config/exec/SSH/askpass 覆盖环境被剔除；remote 只允许 http/https/ssh/git，拒绝 ext/file/未知协议。正常 Git filter 与可信宿主/仓库 Git 配置仍可能执行。
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

### 自启动边界

PalmTTY 自启动始终属于当前用户：Windows Task Scheduler 使用交互用户 token + 最低权限，Linux 使用 `systemd --user`。Windows 安装阶段会在当前用户 Local AppData 下编译一个 GUI-subsystem 原生 host，计划任务直接启动这个 exe；host 以无 console 方式创建 Node Agent，并把它放入 kill-on-close Job Object，同时允许子进程 break away，因此计划任务终止时仍能监督 Agent，而独立 Session Worker 保持单独生命周期。PowerShell 只在安装时负责编译，不再是长期运行链的一部分。该设计不改变用户 token，也不改变提权边界。PalmTTY 不安装 LocalSystem/root service，也不会静默开启 Linux linger。

可选 Agent `--env-file` 让 bootstrap secret 的**值**不进入 task/unit argv；严格解析器不做 shell expansion。真实 env 文件应放在仓库外并只允许 PalmTTY 用户读取；Linux autostart 安装会拒绝 group/world 可读文件。Linux 停止/restart Agent service 时使用 `KillMode=process`，避免把独立 Session Worker 重新归类成普通 service child 一起终止；这仍不代表 OS reboot 后旧 PTY 能存活。

### 推荐部署

优先使用私有 HTTPS 入口，例如 Tailscale Serve；或使用 Caddy/QNAP 等可信 HTTPS 反向代理。PalmTTY 上游端口保持私有。
