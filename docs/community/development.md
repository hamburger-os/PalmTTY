<!-- bilingual -->
# Development workflow / 开发工作流

## English

### Before changing code

Read:

1. [../ai/invariants.md](../ai/invariants.md)
2. [../ai/current-state.md](../ai/current-state.md)
3. the relevant owner-facing module under [../owner/README.md](../owner/README.md)

### Before finishing

Run:

```powershell
pnpm docs:check
pnpm typecheck
pnpm scripts:check
pnpm test
pnpm build
```

For a repository-wide change, `pnpm check` runs the static/test/build acceptance path. When validating a real PalmTTY host, run `pnpm run preflight` separately; it is a machine-specific runtime preflight that depends on the local config/token and validates auth/security configuration plus Agent TCP endpoint bindability. Workspace/runtime validation belongs to the managed workspace API and Session creation path rather than Agent startup. CI installs with `pnpm install --frozen-lockfile` on Windows and Ubuntu. The Agent test suite exercises Fastify HTTP/WebSocket plus the authenticated Session Worker IPC boundary end to end, including replay/snapshot recovery, Agent restart rediscovery, explicit terminal replacement restart, wrong Worker-secret rejection, fresh workspace-environment handling, stale recovery cleanup, backpressure, auth expiry, exited-session cleanup and concurrent session limits. A separate detached-process test proves a Worker survives the complete exit of the Agent process that created it. Windows CI additionally performs a real node-pty + PowerShell 7/ConPTY Unicode smoke test. Local Windows checks prefer `pwsh.exe` when installed and otherwise use Windows PowerShell for generic ConPTY/Worker-process integration coverage, so `pnpm check` does not require an extra shell installation. Runtime executable discovery treats the current user's `%LOCALAPPDATA%\Microsoft\WindowsApps` directory specially because MSIX App Execution Aliases are reparse points that normal Node file traversal can reject even though Windows can launch them. The root development launcher reads the validated PalmTTY config after preflight, derives the local Agent URL, injects it into the Web dev process as `PALMTTY_AGENT_URL`, and keeps the Agent on that configured endpoint. Vite uses strict port 5173 and listens on `0.0.0.0` by default. The launcher generates exact development Origins from current private/overlay IPv4 interfaces and injects them only into the `--development` Agent, so LAN testing does not require editing `trustedOrigins` and does not weaken production Origin policy. On Windows the launcher also enables content-free Worker/PTTY spawn phase tracing by default so a visible console flash can be correlated to a lifecycle stage without logging argv, environment values or terminal I/O. Web tests/build do not load host runtime config. Update `pnpm-lock.yaml` whenever dependency manifests change.

Any behavior-changing PR must use the documentation-sync workflow in `.agents/skills/docs-sync/SKILL.md`. Security, session lifecycle, reconnect behavior, protocol and configuration changes always require a documentation review.

### Contribution principles

- Keep the terminal core vendor-neutral; Codex is a supported workload, not a protocol dependency.
- Prefer small, testable boundaries.
- Do not add terminal I/O logging for debugging.
- Treat workspace CRUD as a high-trust remote mutation surface; keep authentication, exact Origin checks, persistence validation and Session creation/restart bound to persisted workspace authority rather than per-Session overrides. Terminal-profile discovery must remain bounded enumeration: known Host shells plus registered WSL distributions, not arbitrary command execution.
- Workspace environment is intentionally supported but bounded and persisted; do not broaden it into arbitrary process execution or a secret-management feature without an architecture/security review.
- Keep Session workbench tools separate from terminal transport. Files remain Workspace-root-scoped and read-only. Git writes are now implemented only through the typed operation contract: preserve expected-state checks, fail closed on incomplete/truncated status, serialize by resolved repository rather than Workspace ID, keep rename-aware pathsets and explicit repository-wide stage-all/unstage-all semantics, preserve diff-snapshot verification for destructive restore, explicit trusted-repository acknowledgement, disabled hooks/interactive prompts, bounded subprocesses, and the prohibition on arbitrary browser-supplied Git argv. Treat normal Git filter execution as trusted repository code, not as sandboxed behavior.
- Distinguish implemented platform adapters from platforms actually exercised in CI.

## 中文

### 修改代码之前

先阅读：

1. [../ai/invariants.md](../ai/invariants.md)
2. [../ai/current-state.md](../ai/current-state.md)
3. [../owner/README.md](../owner/README.md) 中对应的 Owner 模块文档

### 完成任务之前

执行：

```powershell
pnpm docs:check
pnpm typecheck
pnpm scripts:check
pnpm test
pnpm build
```

仓库级代码质量门禁可以直接执行 `pnpm check`。在真实 PalmTTY 宿主机上做运行验证时，再单独执行 `pnpm run preflight`；它依赖本机 config/token，用于检查认证/安全配置与 Agent TCP 监听端点是否可绑定，不属于通用 CI 门禁。Workspace/运行环境验证由工作区管理 API 与 Session 创建路径负责，不再阻塞 Agent 启动。CI 在 Windows 和 Ubuntu 上使用 `pnpm install --frozen-lockfile` 安装依赖。Agent 测试套件通过真实 Fastify HTTP/WebSocket 与认证后的 Session Worker IPC 边界，端到端覆盖 replay/snapshot、Agent 重启 rediscovery、显式终端替换重启、工作区环境刷新、错误 Worker secret、stale recovery 清理、backpressure、登录过期、退出清理和并发 Session 上限；独立的真实进程测试还验证创建 Worker 的 Agent 进程彻底退出后 Worker 仍存活。Windows CI 另行通过真实 node-pty 强制启动 PowerShell 7/ConPTY 并验证 Unicode 往返。本机 Windows 质量门禁会优先使用 `pwsh.exe`，未安装时退回系统 Windows PowerShell，仅用于通用 ConPTY/Worker 进程集成测试，因此 `pnpm check` 不再要求额外安装 PowerShell 7。运行时可执行文件解析会专门识别当前用户的 `%LOCALAPPDATA%\Microsoft\WindowsApps`；MSIX App Execution Alias 属于特殊 reparse point，Node 的普通文件遍历可能拒绝它，但 Windows 本身仍可通过该 alias 启动应用。PR 还会执行生产依赖安全审计和 CodeQL；受保护的 `main` 必须通过 PR 和四项自动检查。当前 AI 主维护治理模型有意不强制人工 approval，也不强制 Code Owner approval。根开发启动器会在 preflight 后读取已验证的 PalmTTY config，推导本地 Agent URL，并以 `PALMTTY_AGENT_URL` 注入 Web dev 进程；Agent 仍监听该配置 endpoint。Vite 固定使用 strict 5173，并默认监听 `0.0.0.0`。启动器根据当前私有/overlay IPv4 网卡生成精确 development Origins，只注入 `--development` Agent，因此局域网调试不需要手工修改 `trustedOrigins`，也不会放宽 production Origin 策略。Windows 下根开发启动器还会默认开启不含内容的 Worker/PTTY spawn phase trace，用于把可见 console 闪窗定位到具体生命周期阶段，同时不记录 argv、环境变量值或 terminal I/O。Web 测试/构建不会读取宿主 runtime config。修改依赖清单时必须同步更新 `pnpm-lock.yaml`。

任何影响行为的 PR 都必须按 `.agents/skills/docs-sync/SKILL.md` 同步文档。安全、会话生命周期、重连、协议、配置的变更始终需要文档审查。

### 贡献原则

- 终端核心保持厂商无关；Codex 是支持的工作负载，不是协议依赖。
- 优先建立小而可测试的边界。
- 不要为了调试增加终端 I/O 日志。
- Workspace CRUD 属于高信任远程修改面，必须保持认证、精确 Origin、持久化验证以及“Session 创建/重启只消费持久化 Workspace authority”的边界。终端 Profile 发现必须继续只是“已知 Host Shell + 已注册 WSL 发行版”的有界枚举，不能退化成任意命令执行。
- Workspace environment 已作为有界持久化配置开放；如果要继续扩大到任意进程执行或密钥管理，必须先进行架构与安全审查。
- Session Workbench 工具必须与终端 transport 分离。Files 保持 Workspace 根目录范围内的只读能力。Git 写操作已经只通过 typed operation contract 落地：必须保留 expected-state 校验、truncated/不完整 status fail closed、按已解析仓库而不是 Workspace ID 串行、rename-aware pathset、显式仓库级 stage-all/unstage-all、破坏性 restore 的 diff-snapshot 校验、可信仓库显式确认、hooks/交互提示禁用、有界子进程，以及“禁止浏览器传任意 Git argv”的边界。正常 Git filter 仍属于可信仓库代码执行，不能把当前设计描述成沙箱。
- 必须区分“已经实现的平台适配器”与“已进入 CI 实机路径的平台”。
