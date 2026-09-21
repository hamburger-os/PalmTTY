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
   |           |             |
 auth   workspace catalog   static PWA
              |
       runtime validation
              |
      authenticated local IPC
              |
      per-session Worker
         |           |
      node-pty   headless xterm
         |       seq + replay
         |
 Host shell / WSL shell
         |
 Codex / Git / toolchain
~~~

### Repository components

- apps/agent: HTTP/WebSocket control plane, authentication, security gates, Worker discovery and browser↔Worker proxying.
- apps/web: mobile-first React/xterm interface. Its visual theme/performance preference is browser-local presentation state; it does not enter Agent, Workspace or Session authority.
- packages/protocol: executable browser protocol schemas.
- packages/config: operator YAML schema for server/auth/session policy.
- Agent workspace store: versioned per-user persistent workspace catalog, separate from operator YAML.
- docs: four documentation layers.

### Session ownership

Each Session is owned by one independent detached Worker process. The Worker owns the PTY, headless terminal mirror, monotonically increasing output sequence, bounded replay history and exited-session retention.

Session lifecycle actions are explicit. Termination moves an active Session through `stopping` to `exited` and keeps its retained terminal state available. Restart is a replacement operation: it waits for the old PTY to exit, retires the retained Session, then creates a new Session ID from the same persisted workspace and previous terminal geometry. Deletion is separate and allowed only for `exited/failed` Sessions; it asks the Worker to retire immediately and release terminal/recovery state. The Agent deliberately does not own a second canonical copy of terminal state or delete Worker recovery files behind the Worker's back.

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

Every Worker has an independent 256-bit secret. The secret is sent to the Worker once through anonymous stdin at creation time and persisted only in the local runtime recovery area; it never reaches the browser. Recovery state is isolated by private Worker IPC generation; the current protocol v4 uses a `runtime-v4` directory and does not rediscover previous-generation runtime state. IPC frames and socket backlog are bounded.

Persisted PIDs are diagnostic metadata only. PalmTTY never treats an old PID as sufficient authority to kill a process. A failed Agent connection is also not proof that a Worker is dead: potentially-live recovery metadata is preserved, and an adopted Worker retries control-plane reconnection instead of converting an IPC outage into PTY loss. Missing Worker-owned recovery files are republished by the Worker; conflicting recovery authority fails closed.

Workspace definitions are persistent Agent-owned state managed through authenticated, exact-Origin-protected HTTP endpoints. The Web editor has bounded runtime inspection for directory browsing and installed shell profiles; neither is a general file/command API. Workspace definitions may include a bounded environment map and multiline startup input. Session creation/restart do not accept ad-hoc cwd/shell/environment overrides; they resolve persisted workspace authority by ID. On Windows, every new/restarted Host terminal refreshes Machine/User environment variables before resolving PATH and applying workspace overrides. WSL runtimes resolve `wsl.exe`, pass distribution/cwd/shell as structured argv, and forward configured workspace variable names through `WSLENV`. The Worker bootstrap carries only the normalized launch specification. Worker durability begins at an authenticated, idempotent `adopt` commit: a lost adoption response is retried over fresh IPC, while a never-adopted Worker expires its short creation lease and self-cleans.

### Reconnect model

All PTY output is processed inside the Worker in one ordered pipeline:

1. update headless xterm;
2. allocate seq;
3. append to bounded replay;
4. deliver to the connected Agent/browser when present.

On attach, the browser sends its fitted rows/columns together with `lastSeq`. The Worker applies that geometry to the canonical PTY/headless terminal before recovery. Retained history is replayed only when the geometry is unchanged and the requested sequence is still retained; a geometry change forces a fresh serialized snapshot. Recovery frames are sent before `hello`, which marks the recovery-complete boundary. Recovery and establishment of the live subscription occur within the same ordered Worker operation, preventing a message gap.

## 中文

PalmTTY 是一个单用户、自托管的交互式开发终端控制面。Web 端主题与视觉性能档只属于浏览器本地展示状态，不进入 Agent、Workspace 或 Session 权限/持久化模型。

每个 Session 由独立 detached Worker 持有。Worker 是 PTY、headless xterm、输出序号、有限 replay 和退出保留期的唯一 canonical owner；Agent 只负责 Web/API、认证、安全策略、Worker 发现与浏览器代理。

Session 生命周期动作明确分离：“终止”把活动会话推进为 `stopping → exited`，退出后的终端状态仍在 retention 内可查看；“重启”会等待旧 PTY 退出并 retire 旧 Session，再按同一 Workspace 与原终端几何创建新的 Session ID；“清除”只允许用于 `exited/failed` 会话，并由 Worker 立即释放 terminal/replay/recovery state 后退出。Agent 不直接删 Worker 的恢复文件来伪造删除。

当前持久化语义包括：

- 浏览器断线后终端继续运行；
- WebSocket 重连后通过 replay/snapshot 恢复；
- Agent 重启后 Worker/PTY 继续运行，新 Agent 可重新发现同一 Session。

不承诺 Windows/主机重启、用户注销或 Worker 本身死亡后的终端持久化。Agent 登录 Session 仍只在内存中，所以 Agent 重启后需要重新登录，再附着原终端。

Windows 本地控制 IPC 使用 Named Pipe；其他当前 CI 平台使用 Unix domain socket。每个 Worker 有独立 256-bit secret，创建时只经匿名 stdin 传入，不发送到浏览器。持久化 PID 只用于诊断，不能作为 kill authority。Agent 暂时无法连接 Worker 并不等于 Worker 已死亡，因此不会仅因 IPC 超时删除可能仍存活 Worker 的恢复能力；已接管 Worker 的控制连接会持续退避重连。Worker 自己拥有 recovery metadata，文件缺失时会重新发布；如果发现恢复权限被其他内容替换，则 fail closed。

Workspace 现在是 Agent 持有的独立持久化状态，通过“认证 + 精确 Origin”保护的 HTTP API 在网页端创建、编辑和删除；编辑器提供有边界的目录浏览与已安装 Shell 探测，不读取文件内容，也不是通用命令执行接口。Workspace 可以持久化有界 environment 和多行启动输入；创建/重启 Session 时不允许临时注入 cwd/shell/env，而是按 workspace ID 重新解析持久化定义。Windows Host 新终端会重新读取 Machine/User 环境与最新 PATH 后再叠加 Workspace environment；WSL 把发行版、cwd、Shell 作为结构化 argv 传递，并通过 `WSLENV` 转发配置变量名。Worker bootstrap 只接收规范化后的运行规格。

PTY 输出、headless mirror、seq 与 replay 都在 Worker 内按同一有序流水线更新，因此 Agent 不在线期间状态仍连续。浏览器恢复时把已 fit 的 rows/cols 与 lastSeq 一起提交；Worker 先把 canonical PTY/headless mirror 调整到该 geometry，尺寸未变且历史仍可用时才 replay，尺寸变化或历史过旧时使用新 geometry 下的 snapshot。恢复帧之后的 `hello` 表示恢复完成，恢复边界与实时订阅之间不留消息窗口。
