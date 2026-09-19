<!-- bilingual -->
# Architecture / 架构

## English

PalmTTY is a single-user, self-hosted control plane for interactive development terminals.

```text
Mobile browser / PWA
        |
     HTTPS/WSS
        |
trusted VPN or reverse proxy
        |
PalmTTY Agent (Fastify)
   |        |         |
 auth    session   static PWA
           |
        node-pty
           |
         ConPTY
           |
      PowerShell 7
           |
  Codex / Git / toolchain
```

### Repository components

- `apps/agent`: HTTP/WebSocket server, authentication, security gates, PTY/session ownership and terminal-state mirror.
- `apps/web`: mobile-first React/xterm interface.
- `packages/protocol`: executable HTTP/WebSocket schemas shared by Agent and browser.
- `packages/config`: YAML configuration schema and workspace allowlist.
- `docs/`: four documentation layers described by the documentation index.

### Session semantics

The current architecture is **disconnect-persistent**: closing a tab, changing mobile networks, or reconnecting WebSocket does not kill the PTY while the Agent process remains alive.

It is **not Agent-restart persistent**. Independent session workers are a later architecture milestone.

### Reconnect model

The Agent owns a headless xterm state mirror. PTY output is serialized through one ordered pipeline, assigned a monotonically increasing sequence, stored in a bounded replay buffer, and then broadcast.

On attach:

- a live browser with a retained sequence can receive missing replay frames;
- a new/reloaded browser, or a client that fell behind the retained buffer, receives a serialized terminal snapshot;
- after the boundary is established, live output continues normally.

Exited sessions are retained for a configurable bounded period (30 minutes by default) and then disposed. Replay history is also byte-bounded, including the case where a single PTY output chunk is larger than the replay budget.

This prevents browser lifetime from becoming terminal lifetime and avoids unbounded transcript or exited-session storage.

## 中文

PalmTTY 是一个单用户、自托管的交互式开发终端控制面。

```text
手机浏览器 / PWA
        |
     HTTPS/WSS
        |
可信 VPN 或反向代理
        |
PalmTTY Agent (Fastify)
   |        |         |
 认证     会话管理    静态 PWA
           |
        node-pty
           |
         ConPTY
           |
      PowerShell 7
           |
 Codex / Git / 开发工具链
```

### 仓库组件

- `apps/agent`：HTTP/WebSocket、认证、安全闸门、PTY/会话生命周期以及终端状态镜像。
- `apps/web`：面向手机的 React/xterm 界面。
- `packages/protocol`：Agent 与浏览器共享的可执行协议 Schema。
- `packages/config`：YAML 配置与 workspace 白名单 Schema。
- `docs/`：四层文档体系。

### 会话语义

当前架构实现的是**浏览器断线持久化**：浏览器关闭、手机切换网络、WebSocket 重连都不会在 Agent 仍运行时结束 PTY。

当前**不承诺 Agent 重启持久化**。把每个会话拆成独立 worker 属于后续架构阶段。

### 重连模型

Agent 内维护 headless xterm 终端状态镜像。PTY 输出经过同一个有序流水线处理，分配单调递增序号，写入有界 replay buffer，再发送给浏览器。

重新连接时：

- 仍保存旧序号的浏览器可以补发缺失帧；
- 页面重载、浏览器被系统杀掉、或者落后太多时，直接收到当前终端序列化快照；
- 完成恢复边界后再继续接收实时输出。

已退出的会话只在可配置的有限时间内保留（默认 30 分钟），之后会释放终端镜像、replay 和 metadata。Replay 本身按字节严格限制，即使单次 PTY 输出超过预算也不会永久突破上限。

这样既不会把浏览器生命周期等同于终端生命周期，也不会无限保存原始输出或已退出会话。
