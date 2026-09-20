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
- Agent 启动前 fail-fast preflight：认证/安全配置、workspace 目录与 Shell 绝对路径解析；
- Agent 启动并行 rediscovery、认证和有限重试；
- Agent 正常/异常退出不终止 Worker；
- IPC 暂时不可达不会删除可能仍存活 Worker 的 recovery capability；
- Worker 自动重新发布缺失 recovery state，对冲突 recovery authority fail closed；
- persisted PID 仅用于诊断/辅助确认进程明确死亡，不作为 kill authority；
- 未 adoption Worker 通过短创建租约自清理，adoption 后才进入持久 Session；
- 单用户 token 登录和 Cookie 会话；
- Origin、安全启动闸门和基础限流；
- 手机端 xterm/PWA、特殊键栏与长文本 Composer；
- Windows/Ubuntu 双平台 CI；
- 真正的 detached-process 集成测试：创建 Worker 的 Agent 进程退出后，另一个 Agent 可找回同一活终端及 replay；
- Windows CI 实际启动 PowerShell 7/ConPTY，并验证 resize 与中文 Unicode 往返；
- Pull Request 生产依赖漏洞审计与 CodeQL；
- 四层文档体系、docs-sync Agent Skill 与 Apache-2.0。

## 当前持久化边界

已实现：

- 浏览器关闭/刷新/断网后 Session 继续；
- Agent API/Web 进程重启后 Session 继续；
- Agent 重启后重新登录，可以重新附着原 Session；
- Agent 不在线期间 Worker 仍继续维护终端镜像与 replay。

未实现：

- Windows/主机重启持久化；
- 用户注销后的 PTY 持久化；
- Worker 进程自身死亡后的恢复。

## 仓库治理状态

AI 主维护模式的 main Ruleset 已启用：PR 必须经过 Windows/Ubuntu CI、生产依赖安全审计和 CodeQL，主干禁止 force push/删除，只允许 squash，并要求解决 review conversation；人工 approval 与 CODEOWNERS approval 不作为硬门槛。

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
- Windows runtime 文件 ACL 实机检查。

### P1：安全增强

- Passkey/WebAuthn；
- 登录设备管理与吊销；
- 更完整的本地 IPC/文件权限攻击面测试；
- 更完整但不记录终端内容的安全事件；
- 可信反向代理实机验证。

### P2：增强开发体验

- Git 状态/diff；
- 只读文件预览；
- 本地服务入口；
- WSL/Linux/macOS 适配。

### P3：更强持久化（需要重新设计）

只有出现明确需求时，再评估 OS reboot persistence。它不能简单复用当前 Worker 方案，因为重启后不存在“活 PTY”，需要定义新的任务/状态恢复模型。

## 不应提前做

在真实设备与长期运行稳定之前，不建议投入完整浏览器 IDE、多用户协作、云中继或未经设计的 reboot persistence。
