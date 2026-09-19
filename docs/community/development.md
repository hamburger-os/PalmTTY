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

For a repository-wide change, `pnpm check` runs the same acceptance path.

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

仓库级变更可以直接执行 `pnpm check`。

任何影响行为的 PR 都必须按 `.agents/skills/docs-sync/SKILL.md` 同步文档。安全、会话生命周期、重连、协议、配置的变更始终需要文档审查。

### 贡献原则

- 终端核心保持厂商无关；Codex 是支持的工作负载，不是协议依赖。
- 优先建立小而可测试的边界。
- 不要为了调试增加终端 I/O 日志。
- 如果扩大远程文件系统或进程权限，必须先进行架构与安全审查。
- 未进入 CI 验证的平台，不宣称已经正式支持。
