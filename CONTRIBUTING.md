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

CI repeats the acceptance path on Windows and Ubuntu. The Agent suite includes end-to-end HTTP/WebSocket/node-pty coverage for authentication, Origin enforcement, ordered resume/input/resize handling, reconnect recovery, backpressure, auth expiry and exited-session cleanup. Windows CI additionally includes a real PowerShell 7 / ConPTY Unicode smoke test. Pull requests also run the production-dependency vulnerability audit and CodeQL.

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
- Remote callers select configured workspaces; they do not gain arbitrary cwd/shell authority. / 远程端只能选择预配置 workspace。
- New buffers and long-lived state must be bounded. / 新增缓冲区和长期内存状态必须有明确上限。
- Codex and other AI CLIs remain workloads, not PalmTTY protocol dependencies. / AI CLI 是工作负载，不是核心协议依赖。
- Do not claim Agent-restart persistence until session workers exist and are tested. / 未实现独立 worker 前，不宣称 Agent 重启可恢复会话。

Contributions are licensed under Apache-2.0 and must follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
