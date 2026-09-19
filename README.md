# PalmTTY

**Your dev shell, in your palm.**

PalmTTY is a mobile-first, self-hosted remote development console for local shells and AI coding agents.

The first-class target is **Windows 11 + PowerShell 7 + ConPTY**, with Codex CLI and other terminal-based coding agents running on your own development machine. PalmTTY is designed for the workflow where your workstation stays at home or in the office, while your phone becomes a secure, reconnectable control surface.

> Status: architecture and MVP planning. The repository is being bootstrapped.

## Why PalmTTY

Most web terminals optimize for desktop browsers or generic SSH access. PalmTTY optimizes for a different job:

- operate a real local PowerShell session from a phone;
- keep terminal sessions alive when the browser disconnects;
- make Codex and other interactive AI CLIs comfortable on a touch screen;
- expose the service through a private network or trusted reverse proxy;
- remain fully self-hosted and independent of any specific AI vendor.

PalmTTY is **not** a hosted IDE and is **not** intended to replace SSH for server administration.

## MVP

The first milestone is intentionally narrow:

1. Run the PalmTTY Agent on Windows 11 as the logged-in, non-administrator user.
2. Spawn PowerShell 7 through Windows ConPTY using `node-pty`.
3. Serve a mobile-first PWA with an `xterm.js` terminal.
4. Create, list, attach to, resize, and terminate terminal sessions.
5. Keep a PTY session alive across browser refreshes, network changes, and WebSocket reconnects while the Agent remains running.
6. Provide a phone keyboard bar for Esc, Tab, Ctrl, Alt, arrows, Ctrl+C, Ctrl+L, and configurable snippets.
7. Support workspace presets such as a repository path plus an optional startup command (for example `codex`).
8. Be safe-by-default: bind locally/LAN-only by default, reject unexpected WebSocket origins, and document trusted reverse-proxy deployment.

## Architecture

```text
                       phone / tablet
                     Safari / Chrome
                           |
                       HTTPS / WSS
                           |
                  trusted access layer
              (Tailscale or reverse proxy)
                           |
                           v
+----------------------------------------------------------+
|                    Windows 11 workstation                |
|                                                          |
|  PalmTTY Agent                                           |
|  +----------------------+     +-----------------------+   |
|  | HTTP / WS API        |<--->| Session Manager       |   |
|  | auth / origin checks |     | ring buffer / resize  |   |
|  +----------+-----------+     +-----------+-----------+   |
|             |                             |               |
|             | static PWA                  | node-pty      |
|             v                             v               |
|       React + xterm.js                 ConPTY             |
|                                           |               |
|                                      PowerShell 7         |
|                                           |               |
|                              +------------+------------+  |
|                              | Codex / Git / npm / ... |  |
|                              +-------------------------+  |
+----------------------------------------------------------+
```

For a home deployment, QNAP can remain the network entry point while PalmTTY runs only on the development PC:

```text
Internet / VPN -> QNAP / reverse proxy -> LAN -> PalmTTY Agent -> ConPTY -> pwsh
```

## Session semantics

PalmTTY distinguishes **browser persistence** from **host persistence**.

### MVP: disconnect-persistent

Closing the tab or losing mobile connectivity does not terminate the PTY. The Agent owns the session and keeps a bounded output buffer. A reconnecting client resumes from the last known sequence number.

### Later: agent-restart persistence

A later milestone will move each PTY into an independent session worker. The main Agent will reconnect to workers over a local IPC channel (Windows named pipes first). This can preserve sessions across an Agent UI/API restart. A full Windows reboot still terminates local terminal processes unless an additional restore strategy is introduced.

## Security model

A PalmTTY session is effectively interactive shell access to the workstation.

The project therefore follows these rules:

- **Never run the Agent as Administrator unless explicitly required for development.**
- Default bind address should not expose PalmTTY directly to the public Internet.
- Prefer Tailscale/WireGuard or an authenticated reverse proxy.
- Validate the `Origin` header on every WebSocket handshake.
- Use secure, HttpOnly, SameSite cookies when built-in authentication is enabled.
- Keep workspaces in an explicit allowlist.
- Do not put long-lived credentials in URLs.
- Do not log terminal input by default.
- Treat terminal output as sensitive.
- Rate-limit authentication and session creation endpoints.
- Display an obvious warning when configured for a public bind address.

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model.

## Planned technology

- **Language:** TypeScript
- **Package manager:** pnpm
- **Web:** React + Vite + xterm.js
- **Agent:** Node.js + Fastify/WebSocket
- **PTY:** node-pty / Windows ConPTY
- **Validation:** Zod
- **Tests:** Vitest + Playwright
- **Primary shell:** PowerShell 7 (`pwsh.exe`)
- **Future shells:** cmd, Git Bash, WSL, Linux/macOS shells

The web UI and Agent live in one repository and are shipped as one self-hosted application. Splitting them into separately deployed services is deliberately out of scope for the MVP.

## Repository layout

```text
PalmTTY/
├─ apps/
│  ├─ agent/              # HTTP/WS API, PTY/session lifecycle
│  └─ web/                # mobile-first PWA
├─ packages/
│  ├─ protocol/           # shared API/WS schemas
│  └─ config/             # configuration types and loaders
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ PROTOCOL.md
│  ├─ ROADMAP.md
│  └─ SECURITY.md
├─ examples/
│  └─ palmtty.example.yaml
└─ README.md
```

## Configuration direction

```yaml
server:
  host: 127.0.0.1
  port: 7688
  trustedOrigins:
    - https://dev.example.com

sessions:
  maxSessions: 8
  scrollbackBytes: 8388608
  idleTimeoutMinutes: 0

workspaces:
  - id: palmtty
    name: PalmTTY
    cwd: D:\\Code\\PalmTTY
    shell: pwsh
    command: codex

  - id: powershell
    name: PowerShell
    cwd: C:\\Users\\me
    shell: pwsh
```

The final schema may change before the first alpha.

## Mobile UX principles

PalmTTY should not be a desktop terminal squeezed onto a narrow screen.

The mobile UI will provide:

- a workspace/session home screen before opening a terminal;
- a sticky programmable key row;
- explicit terminal focus and scrollback modes;
- a multiline composer for pasting or dictating longer prompts;
- automatic reconnect with visible connection state;
- landscape full-terminal mode;
- PWA installation and safe-area support;
- touch-friendly session switching and termination.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

The intended sequence is:

- **M0 — Bootstrap:** repository, protocol, config, CI.
- **M1 — Local terminal:** PowerShell/ConPTY session lifecycle and xterm.js UI.
- **M2 — Mobile:** reconnect/resume, keyboard bar, PWA, workspace launcher.
- **M3 — Secure self-hosting:** authentication, reverse-proxy guidance, audit controls.
- **M4 — Durable sessions:** independent session workers and Agent restart recovery.
- **M5 — Cross-platform:** Linux/macOS and optional WSL-native adapters.

## Non-goals for the first release

- full browser IDE/editor;
- arbitrary remote desktop;
- multi-user SaaS;
- cloud relay operated by the PalmTTY project;
- automatic privilege escalation;
- replacing Codex/Claude Code/OpenCode with a custom agent.

## Contributing

PalmTTY is at the architecture stage. Design discussion and implementation PRs are welcome once the bootstrap issues land.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

An open-source license will be selected before the first tagged release. Until then, please do not assume rights beyond those granted by GitHub's Terms of Service.
