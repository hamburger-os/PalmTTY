# Architecture

This document defines the architecture target for PalmTTY. It is intentionally more precise than the README so implementation work can be split without changing the core contracts.

## 1. Product boundary

PalmTTY is a **self-hosted control plane for local interactive terminals**.

The first supported environment is:

- Windows 11
- PowerShell 7
- Windows ConPTY
- a modern mobile browser
- a private overlay network or trusted HTTPS reverse proxy

The shell remains a normal local shell. PalmTTY does not intercept or reinterpret commands, and AI coding tools such as Codex remain ordinary terminal applications.

## 2. Design principles

1. **Local first.** Terminal processes run on the user's development machine.
2. **Mobile first.** Touch, narrow viewports, reconnects, and long-form prompt entry are first-class constraints.
3. **Session continuity.** Browser lifetime must not define terminal lifetime.
4. **Small trusted core.** The privileged surface is the Agent and session manager, not the UI.
5. **Explicit exposure.** Public network exposure is never the default.
6. **Vendor neutral.** PalmTTY knows shells and workspaces, not Codex-specific protocol details.
7. **Windows first, portable later.** Avoid abstractions that make Windows second-class merely to claim early portability.

## 3. System context

```text
+------------------+       HTTPS/WSS       +----------------------+
| Mobile browser   | <-------------------> | Access layer         |
| PWA + xterm.js   |                       | VPN/reverse proxy    |
+------------------+                       +----------+-----------+
                                                      |
                                                      | trusted LAN
                                                      v
                                           +----------------------+
                                           | PalmTTY Agent        |
                                           | HTTP/WS + sessions   |
                                           +----------+-----------+
                                                      |
                                                   node-pty
                                                      |
                                                    ConPTY
                                                      |
                                                 PowerShell 7
                                                      |
                                           Codex / Git / toolchain
```

The Agent also serves the compiled PWA in the default deployment. A separate web-server deployment is not required.

## 4. Logical components

### 4.1 Web application

Responsibilities:

- list configured workspaces;
- list live sessions;
- create/attach/terminate sessions;
- render terminal output with xterm.js;
- send input and resize messages;
- implement reconnect/resume behavior;
- provide the mobile key bar and prompt composer;
- show security/exposure warnings returned by the Agent;
- install as a PWA.

The browser must never receive filesystem credentials or host secrets merely to render a workspace.

### 4.2 HTTP/WS API

Responsibilities:

- authentication/session validation;
- CSRF/origin controls;
- workspace/session CRUD;
- WebSocket upgrade;
- protocol version negotiation;
- health/readiness;
- static asset serving.

The API is versioned under `/api/v1`.

### 4.3 Session Manager

The Session Manager owns the in-memory map of sessions.

Each session contains at least:

```ts
type Session = {
  id: string;
  workspaceId: string;
  state: "starting" | "running" | "exited" | "failed";
  createdAt: string;
  lastAttachedAt?: string;
  pid?: number;
  cols: number;
  rows: number;
  exitCode?: number;
  exitSignal?: number;
};
```

It is responsible for:

- spawning PTYs;
- input/output routing;
- resize serialization;
- connection fan-out;
- terminal-state snapshotting;
- idle/retention policy;
- cleanup after exit.

### 4.4 PTY adapter

The MVP adapter uses `node-pty`.

On Windows:

```text
PalmTTY Agent -> node-pty -> ConPTY -> pwsh.exe
```

Shell resolution order:

1. explicit absolute `shellPath` in workspace config;
2. `pwsh.exe` found on PATH;
3. Windows PowerShell only when explicitly enabled as fallback.

PowerShell 7 is the documented default. PalmTTY should not silently elevate.

### 4.5 Terminal state mirror

Reconnect correctness is more than storing strings.

The Agent should maintain a headless terminal mirror using `@xterm/headless` and `@xterm/addon-serialize`. Every PTY output chunk is written to both:

- attached WebSocket clients; and
- the headless terminal.

This enables a fresh browser attachment to receive a serialized terminal snapshot rather than replaying an unbounded raw transcript.

The official xterm.js project explicitly supports this headless + serialize use case for restoring terminal state after reconnection.

MVP snapshot strategy:

- headless terminal scrollback is bounded;
- maintain monotonically increasing output sequence numbers;
- on initial attach or a page reload, send a serialized snapshot;
- while a client remains alive, resume missing live frames by sequence number when possible;
- if the requested sequence is older than retained history, send a fresh snapshot.

This avoids making session history an unlimited log.

## 5. Session lifecycle

```text
              create
                |
                v
            [starting]
             /      \
          ready     error
           |          |
           v          v
        [running]  [failed]
           |
           | process exits
           v
         [exited]
           |
           | retention timeout / delete
           v
         removed
```

Browser disconnect does **not** transition a running session to exited.

### Session ownership

MVP is single-user. Multiple browser connections may attach to one session, but all are treated as the same user.

A later multi-user model would need explicit session ownership and ACLs; it is not part of the initial architecture.

## 6. Durable-worker evolution

The MVP Agent owns ConPTY handles directly, so an Agent process crash ends the owned PTYs.

Phase M4 introduces a per-session worker:

```text
                 +------------------+
HTTP/WS Agent <--| local IPC broker |
                 +----+--------+----+
                      |        |
                 named pipe  named pipe
                      |        |
                  worker A   worker B
                      |        |
                   ConPTY    ConPTY
```

Each worker owns exactly one PTY and a bounded state buffer. Workers authenticate local Agent connections with a per-session secret stored in the Agent state directory.

This design separates:

- web/API restart from terminal lifetime;
- failure of one PTY from other sessions;
- eventual packaging of the Agent as a Windows background service from interactive shell ownership.

Before M4 is implemented, documentation must use the term **disconnect-persistent**, not **crash-persistent**.

## 7. Workspace model

A workspace is configuration, not a live shell.

```yaml
workspaces:
  - id: palmtty
    name: PalmTTY
    cwd: D:\\Code\\PalmTTY
    shell: pwsh
    command: codex
    env:
      PALMTTY_WORKSPACE: "1"
```

Rules:

- `id` is unique and URL-safe.
- `cwd` must resolve to an existing directory.
- environment overrides are explicit and must not be returned by the API when marked secret.
- command is optional; without it, the shell opens normally.
- arbitrary `cwd` supplied by a remote client is not accepted in MVP.
- workspace edits are local configuration changes, not remote API operations.

## 8. WebSocket data flow

The first protocol revision uses JSON frames for simplicity and debuggability.

Client to server:

- `input`
- `resize`
- `ack`
- `ping`

Server to client:

- `hello`
- `snapshot`
- `output`
- `exit`
- `error`
- `pong`

Exact schemas are defined in [PROTOCOL.md](PROTOCOL.md).

If profiling shows JSON encoding to be a bottleneck, terminal output can move to a compact binary frame in a later protocol version without changing session semantics.

## 9. Mobile interaction model

The terminal is one surface, not the entire application.

### Home

Shows:

- workstation status;
- configured workspaces;
- running sessions;
- shell/command identity;
- last activity;
- create/attach actions.

### Terminal

Contains:

1. header with session/connection state;
2. xterm viewport;
3. programmable key bar;
4. optional multiline composer.

The composer is important for AI CLI usage: mobile dictation, IME text, and multi-paragraph prompts should be entered outside xterm and then sent as one terminal input transaction.

### Keyboard policy

Required built-in keys:

- Esc
- Tab
- Ctrl toggle
- Alt toggle
- arrow keys
- Ctrl+C
- Ctrl+L

The key bar is configurable later, but the MVP ships sensible defaults.

## 10. Configuration paths

Proposed defaults:

- Windows: `%APPDATA%\\PalmTTY\\config.yaml`
- Linux: `$XDG_CONFIG_HOME/palmtty/config.yaml` or `~/.config/palmtty/config.yaml`
- macOS: `~/Library/Application Support/PalmTTY/config.yaml`

Runtime state must be kept separately from configuration.

## 11. Deployment model

Recommended home deployment:

```text
phone -> Tailscale/WireGuard -> PalmTTY Agent
```

Alternative:

```text
phone -> HTTPS -> QNAP/Caddy/auth layer -> LAN -> PalmTTY Agent
```

The Agent should bind to loopback by default. LAN bind is opt-in. Public bind should require an explicit acknowledgement flag and print a warning.

## 12. Observability

Default logs should include:

- Agent startup/shutdown;
- bind address;
- auth success/failure metadata without credentials;
- session create/attach/detach/exit;
- protocol errors;
- rejected origins;
- unexpected PTY errors.

Default logs must **not** include:

- terminal keystrokes;
- prompt contents;
- terminal output;
- access tokens;
- environment variable values.

## 13. Failure handling

The Agent should degrade per session where possible.

Examples:

- PTY spawn failure -> mark only that session failed.
- one WebSocket closes -> detach only that connection.
- terminal snapshot failure -> reconnect with bounded raw replay or clear error.
- bad resize -> reject frame, do not kill session.
- unexpected ConPTY error -> mark session failed and keep Agent alive whenever the underlying library allows it.

Windows/ConPTY integration deserves stress tests because PTY errors occur at the boundary between Node and native code.

## 14. Testing strategy

### Unit

- config parsing and redaction;
- protocol schema validation;
- session state transitions;
- origin matching;
- ring/snapshot policy;
- key mapping.

### Integration

Windows CI should test:

- spawn `pwsh`;
- execute a command;
- Unicode/CJK round trip;
- resize;
- Ctrl+C;
- disconnect/reattach;
- child exit;
- multiple concurrent sessions.

### Browser

Playwright mobile emulation:

- open workspace;
- create session;
- type command;
- rotate viewport;
- background/foreground;
- reconnect;
- key bar behavior;
- PWA safe-area layout.

Real iOS Safari testing remains necessary for IME, visual viewport, and keyboard behavior.

## 15. Architecture decisions to revisit

Before v1.0:

- built-in auth versus relying only on an access layer;
- exact worker IPC for M4;
- packaging as Windows service versus tray application;
- storage format for session metadata;
- Linux/macOS adapter boundary;
- whether session sharing should ever become a supported feature.
