# Contributing to PalmTTY / 参与 PalmTTY

PalmTTY welcomes focused contributions that preserve its security and session-continuity boundaries.

PalmTTY 欢迎聚焦且可验证的贡献，尤其要保持安全边界和会话连续性设计。

## Start with the right place / 从正确入口开始

- Bug: use the Bug Report Issue Form.
- Feature or architecture change: open a Feature Request first when the scope is substantial.
- Setup question: use Question / Support.
- Security vulnerability: follow [SECURITY.md](SECURITY.md), never a public exploit report.

For architecture-changing work, discuss the change before a large PR.

涉及架构边界的较大改动，请先在 Issue 中讨论。

## Read first / 开始之前

- [Community development guide / 社区开发指南](docs/community/development.md)
- [Architecture / 架构](docs/community/architecture.md)
- [Security / 安全](docs/community/security.md)
- [AI invariants](docs/ai/invariants.md)
- [Governance](GOVERNANCE.md)

## Local setup / 本地开发

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

If a dependency manifest changes, regenerate and commit `pnpm-lock.yaml`.

## Required checks / 必须检查

```text
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
```

Repository-wide changes should pass `pnpm check`.

CI repeats the acceptance path on Windows and Ubuntu. The Agent suite covers Fastify HTTP/WebSocket plus authenticated Session Worker IPC, including Agent restart rediscovery, replay/snapshot recovery, wrong Worker-secret rejection, stale recovery cleanup, backpressure, auth expiry, exited-session cleanup and concurrent session limits. A detached-process integration test proves a Worker survives the complete exit of the Agent process that created it. Windows CI separately runs a real node-pty + PowerShell 7 / ConPTY Unicode smoke test. Pull requests also run the production-dependency vulnerability audit and CodeQL.

影响行为的修改必须按 `.agents/skills/docs-sync/SKILL.md` 同步四层文档。安全、协议、会话生命周期与重连逻辑的改动不能只改代码。

## Pull requests / PR 要求

Keep PRs focused. Explain why the change is needed, not only what files changed. Use the repository PR template and call out:

- user-visible behavior;
- security/authority changes;
- session/reconnect changes;
- tests added or intentionally omitted;
- documentation updated.

## Project principles / 项目原则

- No terminal I/O logging by default. / 默认不记录终端输入输出。
- No secrets in URLs. / secret 不进入 URL。
- No silent privilege elevation. / 不静默提权。
- Workspace CRUD is an authenticated, exact-Origin-protected persistent mutation surface; Session creation still accepts only a workspace ID, and Web clients do not gain arbitrary env injection. / Workspace 可通过认证且受精确 Origin 保护的接口持久化管理；Session 创建仍只接受 workspace ID，网页端不开放任意 env 注入。
- New buffers and long-lived state must be bounded. / 新增缓冲区和长期内存状态必须有明确上限。
- Codex and other AI CLIs remain workloads, not PalmTTY protocol dependencies. / AI CLI 是工作负载，不是核心协议依赖。
- Keep Agent lifetime separate from terminal lifetime: PTY, headless terminal state, seq and replay belong to the Session Worker. / Agent 生命周期不能重新绑定终端生命周期；PTY、headless 状态、seq 与 replay 必须归 Session Worker。

Contributions are licensed under Apache-2.0 and must follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
