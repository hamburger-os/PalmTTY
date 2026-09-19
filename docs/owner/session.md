# 会话模型

## 目标

一个 PalmTTY Session 对应一个由 Agent 管理的本机 PTY，会话内通常运行 PowerShell 7，也可以由本地配置自动启动 Codex 等 CLI。

## 当前生命周期

```text
创建
  ↓
running
  ├─ 浏览器断开 ──> 仍保持 running
  ├─ 浏览器重连 ──> attach 同一 PTY
  └─ Shell 退出/用户终止
              ↓
            exited
```

当前会话是**断线持久化**，不是**进程重启持久化**。

## 当前限制

- 同一个会话允许多个浏览器连接，但仍按单用户模型处理。
- resize 采用“最后一次有效尺寸”为准。
- 并发会话数量由配置限制。
- 会话 ID 使用随机值，不包含用户名、目录或 PID 等可预测信息。
- Agent 关闭时会清理自己持有的 PTY。

## Workspace

Workspace 是本机配置，不是浏览器动态创建的数据。它定义：

- ID 和显示名称；
- 工作目录；
- Shell；
- Shell 参数；
- 可选启动命令，例如 `codex`；
- 可选环境变量覆盖。

浏览器只能提交 workspace ID。

## 你审查时重点看

任何允许浏览器直接传 `cwd`、`shellPath` 或任意启动命令的改动，都意味着安全边界扩大，需要单独审查。
