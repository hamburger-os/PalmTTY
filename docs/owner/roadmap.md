# 当前状态与路线

## 当前阶段：可运行 Alpha 基础

本次仓库基础已经包含：

- TypeScript/pnpm monorepo，并提交 `pnpm-lock.yaml`，CI 使用 frozen lockfile 保证依赖解析可重复；
- Windows 优先的 node-pty/ConPTY Session Manager；
- PowerShell 7 workspace；
- HTTP/WebSocket API；
- 单用户 token 登录和 Cookie 会话；
- Origin、安全启动闸门和基础限流；
- xterm headless snapshot + replay 重连；
- 手机端 xterm/PWA 界面；
- 特殊键栏和长文本 Composer；
- Windows/Ubuntu 双平台 CI 已通过；
- Windows CI 会实际启动 PowerShell 7/ConPTY，并验证终端 resize 与中文 Unicode 往返；
- 四层文档体系与 docs-sync Agent Skill；
- Apache-2.0；当前生产依赖许可证扫描只发现 MIT、ISC、BSD-3-Clause，与项目的 Apache-2.0 分发方式没有发现明显冲突。

## 下一阶段优先级

### P0：真实设备与长期运行验证

自动化 CI 已验证 Windows PowerShell 7/ConPTY 启动、resize 调用和中文 Unicode 往返。仍需要真实使用场景持续验证：

- Codex CLI 长时间交互；
- iPhone/Android 中文 IME 与语音输入；
- Ctrl+C 等交互式中断；
- 手机 Wi‑Fi/蜂窝切换、锁屏和恢复；
- QNAP/Caddy 或私有 HTTPS 入口实机部署；
- 长时间运行后的内存与会话清理行为。

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
