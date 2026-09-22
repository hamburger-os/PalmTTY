# GitHub 仓库治理与 Ruleset

## 当前正式方案

截至 2026-09-19，PalmTTY 已启用一个仓库级、作用于默认分支 `main` 的 Active Ruleset，名称为 `main`。

PalmTTY 后续预计主要由 AI 维护，因此仓库治理采用：

> **AI 自主提交 PR → 四项自动门禁全部通过 → Auto-merge；不要求人工 approval。**

这是当前正式接受的治理模型，不再把人工 Code Owner approval 或管理员 bypass 作为待完成项；branch up-to-date 已经开启。

## 当前 Ruleset

实际读取到的规则：

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
- Require branches to be up to date before merging：已开启；
- Require linear history：已开启；
- Bypass actors：无。

Required status checks：

- `CI / check (windows-latest)`
- `CI / check (ubuntu-latest)`
- `Security Audit / production-dependencies`
- `CodeQL / codeql (javascript-typescript)`

## 为什么不要求人工 approval

这是有意选择，而不是缺失配置。

PalmTTY 当前是单维护者、AI 主维护项目。强制人工 approval 会让绝大多数日常更新变成人工排队，而现阶段更重要的是确保：

- AI 不能直接 push `main`；
- 所有改动必须留下 PR 记录；
- Windows 与 Ubuntu CI 必须通过；
- 生产依赖漏洞审计与 license policy 检查必须通过；
- CodeQL 必须通过；
- review conversation 必须处理完；
- 主干不能被删除或 force push；
- 合并历史保持 squash + linear history。

`.github/CODEOWNERS` 仍用于表达所有权和后续社区扩展，但 **Ruleset 不强制 Code Owner approval**。

## 当前接受的取舍

### 强制 branch up to date

当前 `strict_required_status_checks_policy=true`。

PR 在合并前必须基于最新 `main` 重新满足 required checks。这个设置适合 AI 并行维护：仓库已经开启 Update branch，AI 可以自动同步主干并重新跑门禁。

### 不配置 Ruleset bypass

当前没有 bypass actor。

这意味着包括仓库管理员在内，正常情况下都必须遵守 Ruleset。项目接受这个更严格的模型。

如果未来 Ruleset/required workflow 自身发生治理死锁，可以临时在 GitHub Settings 修复 Ruleset；不需要为了预防这种低频情况长期保留自动 bypass。

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

仓库全局仍允许 squash / merge commit / rebase merge，但 `main` Ruleset 已把实际允许的 PR merge method 限制为 squash，因此不需要额外调整。

## Security automation

当前自动门禁：

- Windows CI；
- Ubuntu CI；
- CodeQL；
- `pnpm audit --prod --audit-level high`；
- `pnpm license:check` 生产依赖许可证 fail-closed 检查；
- frozen lockfile；
- GitHub Actions 固定到不可变 commit SHA。

GitHub Dependency Review 曾因 Dependency graph 未开启而无法运行，因此当前使用 portable `pnpm audit`，并通过 `pnpm license:check` 独立检查生产依赖许可证元数据。Dependency graph / Dependency Review、Private vulnerability reporting、Dependabot security updates、Secret scanning / Push protection 都可以作为以后增强项，但**不属于当前 Ruleset 完成条件**。

## Release 治理

正式发布使用 `.github/workflows/release.yml` 的手动 `workflow_dispatch`，不允许 workflow 自己修改 `main`：

- release PR 先通过普通 Ruleset 合入版本与 CHANGELOG；
- root `package.json` 是唯一版本源，workspace 私有包不再维护重复 version；
- 触发 Release 时必须从 `main` 运行；不设置“已完成真实设备/部署验收”的人工勾选门禁，人工验收只作为推荐发布证据；
- workflow 锁定远端 `main` SHA，并针对该 SHA 重跑 Windows/Ubuntu CI、Security Audit（漏洞 + license）和 CodeQL；三个 reusable gate 直接消费传入的 `inputs.ref`，并使用彼此独立的 concurrency namespace，避免 caller `github.workflow` 上下文导致兄弟 gate 互相取消；
- 发布过程中只要 `main` 前进就 fail closed，要求重新触发；
- Tag 必须不存在且不可覆盖；workflow 创建 annotated `vX.Y.Z` Tag，并以远端 peeled tag target 严格绑定锁定的源码 SHA；
- GitHub Release 只在 Tag 已验证后通过 Create Release REST API 创建；workflow 直接持有 API 返回的 Release ID，不依赖 List Releases 重新发现 Draft；对于已存在 Tag，Release 的 `target_commitish` 不作为源码 SHA 证明；
- finalization 之前失败会按该 Release ID 删除本次 Draft/Release，再删除本次 Tag，避免半发布状态。

这套流程沿用 TauTerm 的“锁定源码 → 重新资格验证 → 原子化发布”原则，但 PalmTTY 当前没有桌面安装包，因此只发布 Git Tag / GitHub Release 与 GitHub 自动生成的源码归档，不引入无意义的平台打包步骤。

## AI 维护原则

后续 AI 维护 PalmTTY 时：

1. 必须通过 PR 修改 `main`；
2. 不绕过四项 required checks；
3. workflow 名称或 job 名称变化时，同步检查 Ruleset required context；
4. 修改 workflow / 构建 / 测试入口时，必须在 PR 中明确说明门禁影响；
5. 不把测试、安全审计或文档同步当成可选项；
6. Ruleset 或 Repository Settings 的实际状态变化后，同步更新本文档与 `docs/ai/current-state.md`；
7. 不新增“所有 PR 必须人工 approval”的要求，除非项目所有者以后明确改变治理策略。
