# 当前状态与路线

## 当前阶段：具备 Agent 重启持久化的 Alpha

仓库基础已经包含：

- TypeScript/pnpm monorepo，提交 pnpm-lock.yaml，CI 使用 frozen lockfile；
- Windows 优先的 node-pty/ConPTY；
- 每个 Session 独立 detached Worker；
- Worker 持有 PTY、headless xterm、seq、replay 与 exited retention；
- Agent 作为可重启 HTTP/WebSocket 控制面；
- Windows Named Pipe / Unix socket 本地 IPC；
- 每 Session 256-bit secret、READY + authenticated adoption 创建事务与 Worker-owned recovery metadata；
- Agent 启动前 fail-fast preflight：认证/安全配置与 TCP 监听端点；Workspace 改为独立持久化目录，在创建/编辑和 Session 启动时验证；
- Agent 启动并行 rediscovery、认证和有限重试；
- Agent 正常/异常退出不终止 Worker；
- IPC 暂时不可达不会删除可能仍存活 Worker 的 recovery capability；
- Worker 自动重新发布缺失 recovery state，对冲突 recovery authority fail closed；
- persisted PID 仅用于诊断/辅助确认进程明确死亡，不作为 kill authority；
- 未 adoption Worker 通过短创建租约自清理；`adopt` 为幂等提交，可跨 IPC 重连安全重试，确认后才进入持久 Session；
- 单用户 token 登录和 Cookie 会话；
- Origin、安全启动闸门和基础限流；
- 手机端 Session Workbench（终端 / Git / 文件）、xterm/PWA、触摸特殊键栏与按需长文本输入，中文/英文界面切换，并提供明确的终端替换重启动作；
- Git Source Control 工作台与 Workspace 根目录只读文件浏览/预览已经作为独立、有界、认证的 Agent API 落地，不复用终端协议；Git 已支持 porcelain-v2 状态/结构化 diff/history/branches 与受控 stage/unstage/restore/commit/branch/stash/fetch/pull/push；
- PalmTTY 自有的三主题视觉系统（炫彩流光/黑曜石/白霜）、效果/性能两档、reduced-motion 处理与主题审查 skills；
- Web 端持久化 Workspace CRUD，Host / WSL runtime adapter；正常 UI 使用统一终端 Profile（Host Shell + WSL 发行版），高级 runtime 细节只在 Custom 路径展开；工作区支持有界环境变量与多行启动输入，Session 创建/重启仍只消费持久化 workspace authority；
- Ubuntu CI 已覆盖 Linux host runtime；Windows CI 保持 PowerShell 7/ConPTY 路径；macOS adapter 已按同一 Host 模型实现但尚无仓库 CI；
- 当前用户自启动管理已实现：Windows Task Scheduler 登录任务与 Linux `systemd --user`，支持 install/status/restart/uninstall；可选 env-file 避免把 token 值写入 task/unit argv，Linux 会拒绝 group/world 可读的 env-file；
- Windows/Ubuntu 双平台 CI；
- 真正的 detached-process 集成测试：创建 Worker 的 Agent 进程退出后，另一个 Agent 可找回同一活终端及 replay；
- Windows CI 实际启动 PowerShell 7/ConPTY，并验证 resize 与中文 Unicode 往返；
- Pull Request 生产依赖漏洞审计、fail-closed 生产依赖 license policy 检查与 CodeQL；
- root `package.json` 作为唯一 Release/runtime 版本源，私有 workspace package 不再重复维护 version；
- 手动触发的 guarded Release Action：锁定 `main` SHA，针对同一 SHA 重跑 Windows/Ubuntu CI、Security/License、CodeQL，确认主干未前进后创建 annotated tag 与 GitHub Release，最终发布前失败会回滚本次 Tag/Release；真实设备/部署检查保留为推荐证据，不设置无信息增益的人工勾选门禁；
- 四层文档体系、docs-sync Agent Skill 与 Apache-2.0。

## 当前持久化边界

已实现：

- 浏览器关闭/刷新/断网后 Session 继续；
- Agent API/Web 进程重启后 Session 继续；
- Agent 重启后重新登录，可以重新附着原 Session；
- Agent 不在线期间 Worker 仍继续维护终端镜像与 replay。

未实现：

- OS reboot 后原 PTY/Worker 的持久化（Agent 本身可通过 Windows/Linux 当前用户自启动重新拉起）；
- 用户注销后的 PTY 持久化；
- Worker 进程自身死亡后的恢复。

## 仓库治理状态

AI 主维护模式的 main Ruleset 已启用：PR 必须经过 Windows/Ubuntu CI、生产依赖安全/许可证审计和 CodeQL，主干禁止 force push/删除，只允许 squash，并要求解决 review conversation；人工 approval 与 CODEOWNERS approval 不作为硬门槛。正式 Tag 不手工绕过治理，而是在 release PR 合入后由 Release Action 对锁定的 `main` SHA 重新资格验证并发布。

当前 Ruleset 继续作为本阶段正式方案。

## 下一阶段优先级

### P0：真实设备与长期运行验证

自动化已经覆盖浏览器重连、Worker IPC、Agent 重启恢复、真实 detached 进程和 Windows ConPTY。下一阶段继续做真实使用验证：

- Codex CLI 长时间交互；
- iPhone/Android 中文 IME 与语音输入；
- Ctrl+C 等交互式中断；
- 手机 Wi-Fi/蜂窝切换、锁屏和恢复；
- Agent 升级/重启期间的真实手机恢复；
- QNAP/Caddy/Tailscale 私有 HTTPS 入口；
- 长时间运行后的内存、Worker 和 recovery-state 清理；
- Windows runtime 文件 ACL 实机检查；
- Windows 新安装 CLI 后通过“重启终端”刷新 Machine/User PATH 的真实宿主验证；
- WSL 发行版枚举、默认 Shell 启动语义、目录选择与 `WSLENV` Workspace 环境转发的真实发行版验证；
- Windows 登录自启动的真实 Task Scheduler/console 可见性验证；Linux `systemd --user` restart、env-file 权限与可选 linger 的真实主机验证。

### P1：安全增强

- Passkey/WebAuthn；
- 登录设备管理与吊销；
- 更完整的本地 IPC/文件权限攻击面测试；
- 更完整但不记录终端内容的安全事件；
- 可信反向代理实机验证。

### P2：增强开发体验

Git 已完成从只读 status/diff 到受控 Source Control 工作台的第二阶段：typed mutation、stale-state/diff-snapshot 校验、hooks/交互提示禁用、filter 风险确认、分支/history/stash 与非交互 remote 都已落地；继续保持轻量工作台边界。

- 根据真实使用反馈评估更高级 Git 操作（force push、interactive rebase/cherry-pick、reflog、submodule/LFS）；除非有明确需求与独立安全设计，不暴露任意 Git argv；
- 根据真实使用反馈评估受控文件编辑，前置解决并发修改、编码与原子写入；
- 本地服务入口；
- WSL 实机长期验证与发行版边界测试；
- 增加 macOS CI / 实机验证后再提升其支持等级。

### P3：更强持久化（需要重新设计）

只有出现明确需求时，再评估 OS reboot persistence。它不能简单复用当前 Worker 方案，因为重启后不存在“活 PTY”，需要定义新的任务/状态恢复模型。

## 不应提前做

在真实设备与长期运行稳定之前，不建议投入完整浏览器 IDE、可安装插件系统、多用户协作、云中继或未经设计的 reboot persistence。当前 Workbench 提供终端核心 + 有界 typed Git Source Control + 只读 Files 上下文，不引入 Monaco/LSP/插件运行时。
