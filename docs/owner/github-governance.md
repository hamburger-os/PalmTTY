# GitHub 仓库治理与 Ruleset

## 当前状态

截至 2026-09-19，PalmTTY 已经启用一个仓库级、作用于默认分支 `main` 的 Active Ruleset，名称为 `main`。

实际读取到的规则如下：

- Restrict deletions：已开启；
- Block force pushes / non-fast-forward updates：已开启；
- Require a pull request before merging：已开启；
- Required approvals：**0**；
- Dismiss stale approvals：关闭；
- Require Code Owner review：关闭；
- Require last-push approval：关闭；
- Require conversation resolution：已开启；
- Allowed merge method：**仅 squash**；
- Require status checks：已开启；
- Require branches to be up to date before merging：**当前关闭**；
- Require linear history：已开启；
- Bypass actors：**无**。

Required status checks 与当前 workflow Context 一致：

- `CI / check (windows-latest)`
- `CI / check (ubuntu-latest)`
- `Security Audit / production-dependencies`
- `CodeQL / codeql (javascript-typescript)`

## 面向 AI 主维护的判断

当前设计的核心方向是合理的：

> AI 可以独立提出和合并 PR，但不能绕过自动质量门禁。

因此以下配置建议**保持当前状态**：

- Required approvals = **0**；
- 普通代码不要求人工 review；trust-root 文件建议通过精简 CODEOWNERS + Ruleset Code Owner review 单独保护；
- 不强制 last-push approval；
- 不要求 Signed commits；
- 保持 conversation resolution；
- 保持四条 required checks；
- 保持 squash-only、linear history；
- 保持禁止删除 `main` 和 force push。

这些设置避免把 AI 日常维护变成人工审批队列，同时仍要求代码、文档、安全审计和 Windows/Ubuntu 验证全部通过。

## 建议补回的三个保护

### 1. 对 trust root 开启 Code Owner review

仓库已经把 `.github/CODEOWNERS` 缩小为一个很小的 AI trust root，而不是默认拥有所有文件：

- `.github/CODEOWNERS` 自身；
- `.github/workflows/`；
- `.github/dependabot.yml`；
- 根 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`；
- `scripts/docs-check.mjs`；
- 各 workspace 的 `package.json`。

建议在 Ruleset 中打开 **Require review from Code Owners**，同时继续保持 Required approvals = 0。

效果是：

- 普通 Agent/Web/协议/文档代码 PR：仍然可以由 AI 自主通过自动门禁后合并；
- 修改 CI、依赖策略、workspace/test/typecheck/build 入口等“判断 AI 是否合格”的 trust-root 文件：必须由 `@hamburger-os` 人工批准；
- 不再使用 `* @hamburger-os`，因此不会让所有 PR 都变成人工审批。

这是 AI 主维护模式下最值得保留的一条人工边界，因为 required checks 本身也是仓库代码；如果 AI 能同时修改检查器和被检查代码，就存在“门禁被无意削弱但 context 仍然绿色”的风险。

### 2. Require branches to be up to date before merging

当前 Ruleset 的 `strict_required_status_checks_policy` 为 `false`。

建议改为 **true**。

原因：某个 PR 可能在旧的 `main` 上通过全部检查，随后另一个 PR 先合并改变主干；如果不要求 up to date，第一个 PR 仍可依赖旧结果合并。

对于 AI 主维护项目，这个限制的人工成本较低：仓库已经开启 **Always suggest updating pull request branches**，AI 也可以更新分支后重新等待 CI。

### 3. 保留“人工紧急恢复” bypass

当前 Ruleset 没有任何 bypass actor，读取结果为 `current_user_can_bypass: never`。

这提供最强的日常约束，但存在治理死锁风险：如果某次 PR 把 workflow YAML、required context 名称或 GitHub Actions 配置改坏，所要求的 status check 可能根本无法产生，此时正常 PR 流程无法修复自己。

建议增加一个非常窄的恢复出口：

- Actor：Repository administrators；
- Bypass mode：优先选择 **Pull requests only**；
- 不给普通贡献者、Bot 或 AI App 单独配置 bypass；
- 只在 Ruleset/CI 自身损坏时人工使用。

这样 AI 默认仍然不能绕过门禁，但项目所有者保留灾难恢复能力。

## Repository Settings 当前状态

已确认：

- Auto-merge：开启；
- Always suggest updating pull request branches：开启；
- Automatically delete head branches：开启；
- Discussions：开启；
- Wiki：关闭；
- Topics 已设置：
  - `terminal`
  - `remote-development`
  - `self-hosted`
  - `windows`
  - `powershell`
  - `conpty`
  - `xterm`
  - `pwa`
  - `codex`

仓库全局仍允许 squash / merge commit / rebase merge 三种方式，但 **`main` Ruleset 已把实际允许的 PR merge method 限制为 squash**。因此不必为了 AI 维护特意关闭全局 merge/rebase；主干规则已经提供所需约束。

## Security Settings

当前自动化已经强制：

- CodeQL；
- `pnpm audit --prod --audit-level high`；
- frozen lockfile；
- pinned GitHub Action commit SHA。

此前 GitHub Dependency Review 因仓库 Dependency graph 未开启而无法运行，因此目前使用 portable `pnpm audit` 作为 required check。

仍建议在 GitHub Settings 中人工确认：

- Dependency graph；
- Private vulnerability reporting；
- Dependabot alerts；
- Dependabot security updates；
- Secret scanning（账户/仓库支持时）；
- Push protection（账户/仓库支持时）。

启用 Dependency graph 后，可以重新评估是否增加 GitHub Dependency Review；它不是当前 Ruleset 成立的前置条件。

## AI 维护原则

AI 后续修改 Ruleset、workflow、依赖策略或安全门禁时，应遵守：

1. 不删除四条主干 required checks，除非用同等或更强的检查替代；
2. 不扩大 CODEOWNERS trust root 到普通业务代码，也不要让 AI 自动移除 trust-root ownership；
3. workflow 名称或 job 名称变化时，同时检查 Ruleset required context 是否仍然匹配；
4. 修改 workflow 的 PR 必须特别关注“检查是否会因为 YAML/权限错误完全不产生”；
5. 自动维护不依赖普通人工 approval，但 trust-root 改动需要 Code Owner review；
6. 不能把自动测试、安全检查或文档检查当作可选项；
7. Ruleset 实际状态变化后，同步更新本文档和 `docs/ai/current-state.md`。
