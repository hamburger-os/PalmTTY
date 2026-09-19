# GitHub 仓库治理与 Ruleset

## 当前目标

PalmTTY 的代码侧已经有 Windows/Ubuntu CI、锁文件、文档契约、生产依赖漏洞审计与 CodeQL。GitHub 仓库设置也应当把这些门禁变成默认规则，避免依赖维护者“记得不要直接 push”。

当前 GitHub API 连接显示仓库**没有任何 Ruleset**。下面是建议的唯一主干 Ruleset。

## 建议 Ruleset：`main-protection`

- Enforcement status：**Active**
- Target branches：默认分支 `main`
- Bypass：仅 Repository admin；建议选择“仅 Pull Request 场景可绕过”一类最小权限模式，作为单维护者在 CI/规则损坏时的逃生口。

### 分支规则

开启：

- Restrict deletions
- Block force pushes / non-fast-forward updates
- Require a pull request before merging
- Required approvals：**1**
- Dismiss stale approvals when new commits are pushed
- Require review from Code Owners
- Require conversation resolution before merging
- Require status checks to pass
- Require branches to be up to date before merging
- Require linear history

Required status checks 建议在这些 workflow 首次跑完后从 GitHub UI 选择实际出现的 Context：

- `CI / check (windows-latest)`
- `CI / check (ubuntu-latest)`
- `Security Audit / production-dependencies`
- `CodeQL / codeql (javascript-typescript)`

不建议当前强制 Signed commits：对初期外部贡献门槛较高，可在贡献规模扩大后再评估。

## 建议 Repository Settings

### Pull Requests

- 只保留 **Squash merging**
- 关闭 Merge commit
- 关闭 Rebase merge
- 开启 Auto-merge
- 开启“Always suggest updating pull request branches”
- 保持“Automatically delete head branches”开启

### Features

- 开启 **Discussions**，把使用问题和想法讨论从 Bug Issue 分流
- 关闭 **Wiki**：项目已有版本化的 `docs/`，避免双重文档源
- Projects 是否开启按实际路线管理需求决定

### About / Discoverability

建议 Topics：

- `terminal`
- `remote-development`
- `self-hosted`
- `windows`
- `powershell`
- `conpty`
- `xterm`
- `pwa`
- `codex`

在有真实演示站点或文档站之前，Homepage 可以留空。后续应增加 Social preview 图片。

### Security

确认开启：

- Dependency graph（开启后可再增加 GitHub Dependency Review workflow，并将其加入 Required checks）
- Private vulnerability reporting
- Dependabot alerts
- Dependabot security updates
- Secret scanning（若当前账户/仓库支持）
- Push protection（若当前账户/仓库支持）

## 为什么需要人工设置

仓库内文件可以由 PR 审查和版本控制，但 Ruleset、merge 策略、Discussions、Wiki、Topics 与部分 Security 开关属于 GitHub Repository Settings。当前可用 GitHub 连接器只能读取 Ruleset/仓库设置，没有相应的管理写接口，因此不能安全地在本次自动提交中修改这些设置。

完成这些设置后，应再次读取 Ruleset 与仓库元数据，并把本页“建议”改成“已启用”的事实状态。
