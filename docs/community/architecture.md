<!-- bilingual -->
# Architecture / 架构

## English

PalmTTY is a single-user, self-hosted control plane for interactive development terminals.

~~~text
Mobile browser / PWA
        |
     HTTPS/WSS
        |
trusted VPN or reverse proxy
        |
PalmTTY Agent (Fastify)
   |        |        |
 auth   workspace   static PWA
            |
     authenticated local IPC
            |
   per-session Worker
      |           |
   node-pty   headless xterm
      |       seq + replay
    ConPTY
      |
 PowerShell 7
      |
Codex / Git / toolchain
~~~

### Repository components

- apps/agent: HTTP/WebSocket control plane, authentication, security gates, Worker discovery and browser↔Worker proxying.
- apps/web: mobile-first React/xterm interface.
- packages/protocol: executable browser protocol schemas.
- packages/config: YAML configuration schema and workspace allowlist.
- docs: four documentation layers.

### Session ownership

Each Session is owned by one independent detached Worker process. The Worker owns the PTY, headless terminal mirror, monotonically increasing output sequence, bounded replay history and exited-session retention.

The Agent deliberately does not own a second canonical copy of terminal state.

### Persistence semantics

PalmTTY is:

- browser-disconnect persistent;
- WebSocket-reconnect persistent;
- Agent-restart persistent.

Restarting or replacing only the PalmTTY Agent disconnects browser/control sockets but does not terminate the Worker or PTY. A new Agent rediscovers the Worker using local recovery metadata and an authenticated per-session secret.

PalmTTY is not persistent across OS reboot, user logoff, or Worker-process loss.

Login sessions remain in Agent memory, so after Agent restart the user signs in again before reattaching the surviving terminal.

### Local Worker IPC

On Windows the Agent and Worker communicate through a named pipe. Current non-Windows CI uses Unix domain sockets.

Every Worker has an independent 256-bit secret. The secret is sent to the Worker once through anonymous stdin at creation time and persisted only in the local runtime recovery area; it never reaches the browser. IPC frames and socket backlog are bounded.

Persisted PIDs are diagnostic metadata only. PalmTTY never treats an old PID as sufficient authority to kill a process.

### Reconnect model

All PTY output is processed inside the Worker in one ordered pipeline:

1. update headless xterm;
2. allocate seq;
3. append to bounded replay;
4. deliver to the connected Agent/browser when present.

On attach, retained history is replayed when possible. Otherwise the Worker emits a serialized terminal snapshot. Recovery and establishment of the live subscription occur within the same ordered Worker operation, preventing a message gap.

## 中文

PalmTTY 是一个单用户、自托管的交互式开发终端控制面。

每个 Session 由独立 detached Worker 持有。Worker 是 PTY、headless xterm、输出序号、有限 replay 和退出保留期的唯一 canonical owner；Agent 只负责 Web/API、认证、安全策略、Worker 发现与浏览器代理。

当前持久化语义包括：

- 浏览器断线后终端继续运行；
- WebSocket 重连后通过 replay/snapshot 恢复；
- Agent 重启后 Worker/PTY 继续运行，新 Agent 可重新发现同一 Session。

不承诺 Windows/主机重启、用户注销或 Worker 本身死亡后的终端持久化。Agent 登录 Session 仍只在内存中，所以 Agent 重启后需要重新登录，再附着原终端。

Windows 本地控制 IPC 使用 Named Pipe；其他当前 CI 平台使用 Unix domain socket。每个 Worker 有独立 256-bit secret，创建时只经匿名 stdin 传入，不发送到浏览器。持久化 PID 只用于诊断，不能作为 kill authority。

PTY 输出、headless mirror、seq 与 replay 都在 Worker 内按同一有序流水线更新，因此 Agent 不在线期间状态仍连续；浏览器恢复时优先 replay，过旧则 snapshot，恢复边界与实时订阅之间不留消息窗口。
