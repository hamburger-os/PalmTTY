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
pnpm test
pnpm build
```

For a repository-wide change, `pnpm check` runs the static/test/build acceptance path. When validating a real PalmTTY host, run `pnpm run preflight` separately; it is a machine-specific runtime preflight that depends on the local config/token and validates auth/security configuration, Agent TCP endpoint bindability, workspace directories and shell executable resolution. CI installs with `pnpm install --frozen-lockfile` on Windows and Ubuntu. The Agent test suite exercises Fastify HTTP/WebSocket plus the authenticated Session Worker IPC boundary end to end, including replay/snapshot recovery, Agent restart rediscovery, wrong Worker-secret rejection, stale recovery cleanup, backpressure, auth expiry, exited-session cleanup and concurrent session limits. A separate detached-process test proves a Worker survives the complete exit of the Agent process that created it. Windows CI additionally performs a real node-pty + PowerShell 7/ConPTY Unicode smoke test. Local Windows checks prefer `pwsh.exe` when installed and otherwise use Windows PowerShell for generic ConPTY/Worker-process integration coverage, so `pnpm check` does not require an extra shell installation. Runtime executable discovery treats the current user's `%LOCALAPPDATA%\Microsoft\WindowsApps` directory specially because MSIX App Execution Aliases are reparse points that normal Node file traversal can reject even though Windows can launch them. Vite development mode reads the same PalmTTY config to derive the Agent proxy target and uses strict port 5173; `PALMTTY_AGENT_URL` is only an explicit override. Update `pnpm-lock.yaml` whenever dependency manifests change.

Any behavior-changing PR must use the documentation-sync workflow in `.agents/skills/docs-sync/SKILL.md`. Security, session lifecycle, reconnect behavior, protocol and configuration changes always require a documentation review.

### Contribution principles

- Keep the terminal core vendor-neutral; Codex is a supported workload, not a protocol dependency.
- Prefer small, testable boundaries.
- Do not add terminal I/O logging for debugging.
- Do not broaden remote filesystem or process authority without an architecture/security review.
- Do not claim cross-platform behavior until it has CI coverage.

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
pnpm test
pnpm build
```

仓库级代码质量门禁可以直接执行 `pnpm check`。在真实 PalmTTY 宿主机上做运行验证时，再单独执行 `pnpm run preflight`；它依赖本机 config/token，用于检查认证/安全配置、Agent TCP 监听端点是否可绑定、workspace 目录与 Shell 可执行文件解析，不属于通用 CI 门禁。CI 在 Windows 和 Ubuntu 上使用 `pnpm install --frozen-lockfile` 安装依赖。Agent 测试套件通过真实 Fastify HTTP/WebSocket 与认证后的 Session Worker IPC 边界，端到端覆盖 replay/snapshot、Agent 重启 rediscovery、错误 Worker secret、stale recovery 清理、backpressure、登录过期、退出清理和并发 Session 上限；独立的真实进程测试还验证创建 Worker 的 Agent 进程彻底退出后 Worker 仍存活。Windows CI 另行通过真实 node-pty 强制启动 PowerShell 7/ConPTY 并验证 Unicode 往返。本机 Windows 质量门禁会优先使用 `pwsh.exe`，未安装时退回系统 Windows PowerShell，仅用于通用 ConPTY/Worker 进程集成测试，因此 `pnpm check` 不再要求额外安装 PowerShell 7。运行时可执行文件解析会专门识别当前用户的 `%LOCALAPPDATA%\Microsoft\WindowsApps`；MSIX App Execution Alias 属于特殊 reparse point，Node 的普通文件遍历可能拒绝它，但 Windows 本身仍可通过该 alias 启动应用。PR 还会执行生产依赖安全审计和 CodeQL；受保护的 `main` 必须通过 PR 和四项自动检查。当前 AI 主维护治理模型有意不强制人工 approval，也不强制 Code Owner approval。开发模式 Vite 会读取同一 PalmTTY config 推导 Agent 代理目标，并固定使用 strict 5173；`PALMTTY_AGENT_URL` 仅作为显式覆盖。修改依赖清单时必须同步更新 `pnpm-lock.yaml`。

任何影响行为的 PR 都必须按 `.agents/skills/docs-sync/SKILL.md` 同步文档。安全、会话生命周期、重连、协议、配置的变更始终需要文档审查。

### 贡献原则

- 终端核心保持厂商无关；Codex 是支持的工作负载，不是协议依赖。
- 优先建立小而可测试的边界。
- 不要为了调试增加终端 I/O 日志。
- 如果扩大远程文件系统或进程权限，必须先进行架构与安全审查。
- 未进入 CI 验证的平台，不宣称已经正式支持。
