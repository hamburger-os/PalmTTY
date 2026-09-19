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

For a repository-wide change, `pnpm check` runs the same acceptance path. CI installs with `pnpm install --frozen-lockfile` on Windows and Ubuntu; the Windows test suite also performs a real PowerShell 7/ConPTY Unicode smoke test. Update `pnpm-lock.yaml` whenever dependency manifests change.

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

仓库级变更可以直接执行 `pnpm check`。CI 在 Windows 和 Ubuntu 上使用 `pnpm install --frozen-lockfile` 安装依赖；Windows 测试还会真实启动 PowerShell 7/ConPTY 并验证 Unicode 往返。PR 还会执行生产依赖安全审计和 CodeQL；受保护的 `main` 必须通过 PR 和四项自动检查。普通改动设计为无需强制人工 approval；CI、依赖与 workspace 门禁等 trust-root 文件由精简后的 CODEOWNERS 单独标记，计划要求维护者审核。修改依赖清单时必须同步更新 `pnpm-lock.yaml`。

任何影响行为的 PR 都必须按 `.agents/skills/docs-sync/SKILL.md` 同步文档。安全、会话生命周期、重连、协议、配置的变更始终需要文档审查。

### 贡献原则

- 终端核心保持厂商无关；Codex 是支持的工作负载，不是协议依赖。
- 优先建立小而可测试的边界。
- 不要为了调试增加终端 I/O 日志。
- 如果扩大远程文件系统或进程权限，必须先进行架构与安全审查。
- 未进入 CI 验证的平台，不宣称已经正式支持。
