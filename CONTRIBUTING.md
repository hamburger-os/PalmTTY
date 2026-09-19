# Contributing to PalmTTY / 参与 PalmTTY

PalmTTY welcomes focused contributions that preserve its security and session-continuity boundaries.

PalmTTY 欢迎聚焦且可验证的贡献，尤其要保持安全边界和会话连续性设计。

## Read first / 开始之前

- [Community development guide / 社区开发指南](docs/community/development.md)
- [Architecture / 架构](docs/community/architecture.md)
- [Security / 安全](docs/community/security.md)
- [AI invariants](docs/ai/invariants.md)

For architecture-changing work, discuss the change before a large PR.

涉及架构边界的较大改动，请先在 Issue 中讨论。

## Required checks / 必须检查

```text
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
```

Repository-wide changes should pass `pnpm check`.

影响行为的修改必须按 `.agents/skills/docs-sync/SKILL.md` 同步四层文档。安全、协议、会话生命周期与重连逻辑的改动不能只改代码。

## Project principles / 项目原则

- No terminal I/O logging by default. / 默认不记录终端输入输出。
- No secrets in URLs. / secret 不进入 URL。
- No silent privilege elevation. / 不静默提权。
- Remote callers select configured workspaces; they do not gain arbitrary cwd/shell authority. / 远程端只能选择预配置 workspace。
- Codex and other AI CLIs remain workloads, not PalmTTY protocol dependencies. / AI CLI 是工作负载，不是核心协议依赖。
- Do not claim Agent-restart persistence until session workers exist and are tested. / 未实现独立 worker 前，不宣称 Agent 重启可恢复会话。

Contributions are licensed under Apache-2.0.
