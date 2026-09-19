# PalmTTY 项目审查文档

这一层专门给项目所有者阅读，用于在**不逐行审查 AI 代码**的情况下判断实现是否符合既定架构。

这里不记录函数级实现细节，只记录模块职责、关键边界、当前状态和下一步风险。

## 模块索引

- [agent.md](agent.md) — Agent 服务端职责与边界
- [session.md](session.md) — PowerShell/ConPTY 会话模型
- [reconnect.md](reconnect.md) — 断线重连与终端状态恢复
- [security.md](security.md) — 安全模型、认证与公网边界
- [web-mobile.md](web-mobile.md) — 手机端 Web/PWA 交互
- [deployment.md](deployment.md) — Windows、QNAP 与反向代理部署
- [roadmap.md](roadmap.md) — 当前完成度与后续阶段

## 审查原则

以后 AI 完成一项开发任务后，优先检查：

1. [roadmap.md](roadmap.md) 中当前状态是否变化；
2. 与改动模块对应的本文档；
3. [../ai/current-state.md](../ai/current-state.md) 是否与代码状态一致；
4. 安全或重连相关改动必须同时检查 [security.md](security.md) 和 [reconnect.md](reconnect.md)。

如果 Owner 文档与代码事实冲突，应视为任务未完成。
