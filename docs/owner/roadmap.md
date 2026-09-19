# 当前状态与路线

## 当前阶段：可运行 Alpha 基础

本次仓库基础已经包含：

- TypeScript/pnpm monorepo；
- Windows 优先的 node-pty/ConPTY Session Manager；
- PowerShell 7 workspace；
- HTTP/WebSocket API；
- 单用户 token 登录和 Cookie 会话；
- Origin、安全启动闸门和基础限流；
- xterm headless snapshot + replay 重连；
- 手机端 xterm/PWA 界面；
- 特殊键栏和长文本 Composer；
- Windows/Linux CI 配置；
- 四层文档体系与 docs-sync Agent Skill；
- Apache-2.0。

## 下一阶段优先级

### P0：跑通真实 Windows 11

需要持续验证：

- PowerShell 7 启动；
- Codex CLI 交互；
- 中文/IME；
- Ctrl+C；
- resize；
- 手机切网与锁屏；
- 长时间运行后的内存上限。

### P1：独立 Session Worker

目标是让 Agent API/Web 进程重启时，PowerShell/Codex 仍然继续。

拟采用：

```text
Agent
  │ Windows Named Pipe
  ▼
Session Worker
  │
ConPTY
```

这是下一个最大的架构升级。

### P2：安全增强

- Passkey/WebAuthn；
- 登录设备管理；
- 更完整的安全测试；
- QNAP/Caddy/Tailscale 实机部署验证。

### P3：增强开发体验

- Git 状态/diff；
- 只读文件预览；
- 本地服务入口；
- WSL/Linux/macOS 适配。

## 不应提前做

在 P0/P1 稳定之前，不建议投入完整浏览器 IDE、多用户协作、云中继等功能。
