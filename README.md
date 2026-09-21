<div align="center">

# PalmTTY

**Your dev shell, in your palm.**  
**把开发终端放进手掌里。**

Mobile-first · self-hosted · Windows-first · Host + WSL runtimes · xterm.js

[![CI](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml/badge.svg)](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml)
[![CodeQL](https://github.com/hamburger-os/PalmTTY/actions/workflows/codeql.yml/badge.svg)](https://github.com/hamburger-os/PalmTTY/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.11-339933?logo=node.js&logoColor=white)](package.json)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](docs/owner/roadmap.md)

</div>

> [!WARNING]
> PalmTTY exposes an interactive shell with the privileges of the OS user running the Agent. Treat compromise as workstation compromise. Use a private HTTPS entry point or an authenticated HTTPS reverse proxy; do not expose an unauthenticated Agent port to the Internet.

PalmTTY is a mobile-first, self-hosted remote development terminal. Windows 11 remains the primary host target, with native host shells and WSL workspaces; the same host-runtime path is exercised on Ubuntu CI and is designed for Linux/macOS hosts. Codex, Git and other terminal tools remain ordinary shell workloads.

PalmTTY 是一个面向手机、自托管的远程开发终端。Windows 11 仍是首要宿主平台，同时支持宿主机 Shell 与 WSL 工作区；同一套宿主运行时也在 Ubuntu CI 中验证，并按 Linux/macOS 宿主扩展设计。Codex、Git 等工具仍只是普通终端工作负载。

## Status / 当前状态

PalmTTY is **alpha**. Each terminal now runs in an independent durable Session Worker, so restarting only the HTTP/API Agent does not terminate the live PTY. Windows and Ubuntu CI cover authenticated Worker IPC, Agent restart rediscovery, replay/snapshot recovery and detached-process survival; Windows CI also uses real node-pty + PowerShell 7 / ConPTY for Unicode and resize smoke coverage. Real phone + real workstation + long-running Codex hardening is still ongoing.

| Capability | Alpha status |
|---|---|
| Windows / PowerShell 7 / ConPTY | Implemented and exercised in Windows CI |
| Linux host runtime | Implemented and exercised on Ubuntu CI |
| WSL runtime | Implemented with runtime validation; real-owner-host validation still required |
| macOS host runtime | Architecture implemented; no repository macOS CI yet |
| Web workspace management | Persistent create/edit/delete via authenticated same-origin API |
| UI languages | English and Simplified Chinese |
| Visual themes | Spectrum / Obsidian / Frosted with Quality / Performance rendering modes |
| Browser or network disconnect | PTY survives while the Agent stays alive |
| Reconnect | Sequence replay + server-side terminal snapshot fallback |
| Mobile terminal | xterm.js PWA, special-key bar, multiline composer |
| Authentication | Single-user bootstrap token + HttpOnly session cookie |
| Internet exposure | HTTPS/private-network deployment only |
| Agent restart persistence | Implemented: independent Session Worker + authenticated local rediscovery |
| Multi-user ACL | **Not implemented** |
| Tagged release | **Not published yet** |

## Why PalmTTY / 为什么做 PalmTTY

PalmTTY is intentionally narrower than a browser IDE:

- **Keep the real shell on your workstation.** A per-session Worker owns the PTY; the Agent and browser are replaceable clients/control planes.
- **Survive mobile reality.** WebSocket reconnect, bounded replay, snapshot recovery and application heartbeat are built around Wi-Fi/cellular switching and backgrounded tabs.
- **Keep remote authority explicit.** Workspace changes are persistent authenticated mutations, not ad-hoc Session parameters. Session creation still accepts only a workspace ID; environment injection is not exposed by the Web API.
- **Stay AI-vendor-neutral.** Codex, Claude Code, OpenCode and other terminal tools are workloads, not protocol dependencies.
- **Remain self-hosted.** No cloud relay is required by the core architecture.

## Architecture / 架构

```text
Phone / PWA
    │ HTTPS / WSS
    ▼
Private HTTPS entry point
(Tailscale Serve / QNAP / Caddy / equivalent)
    │
    ▼
PalmTTY Agent
 ├─ authentication + exact Origin policy
 ├─ persistent workspace catalog + runtime validation
 ├─ Worker registry / WebSocket proxy
 └─ static Web/PWA
    │ authenticated local IPC
    ▼
Session Worker (one per terminal)
 ├─ node-pty / ConPTY
 ├─ headless xterm snapshot
 └─ bounded sequenced replay
    │
Host shell / WSL shell
    │
Codex / Git / npm / dotnet / ...
```

A browser disconnect does **not** kill the PTY. Restarting only the PalmTTY Agent also leaves the independent Session Worker and PTY alive; after the Agent returns, sign in again and reconnect to the same Session. PalmTTY does **not** claim persistence across Windows/OS reboot, user logoff, or loss of the Worker process itself.

## Quick start on Windows 11 / 快速开始

Requirements:

- Windows 11
- Node.js 22.11+
- Corepack / pnpm
- PowerShell 7 (`pwsh`) for the default Windows host-shell experience; WSL or another explicit shell is optional

```powershell
git clone https://github.com/hamburger-os/PalmTTY.git
cd PalmTTY

corepack enable
pnpm install --frozen-lockfile

Copy-Item examples/palmtty.example.yaml palmtty.local.yaml

$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"

pnpm run preflight
pnpm check
pnpm start
```

Open `http://127.0.0.1:7688`, sign in with the access token, then create a workspace from the Web UI. Workspaces are stored separately from `palmtty.local.yaml`. On Windows, choose **Host** for PowerShell/other Windows shells or **WSL** for a Linux distribution; on Linux/macOS use the Host runtime.

`pnpm run preflight` validates the authentication environment, security exposure rules and configured Agent TCP listen endpoint before the Agent starts. Workspace directories and shells are validated when a workspace is created/updated and again when a Session starts. Windows Store/MSIX PowerShell is supported through the current user's App Execution Alias, and resolved host shells are normalized to absolute launch paths before Worker creation.

For development, run `pnpm dev`. It invokes PalmTTY's `preflight` package script explicitly before Vite and the Agent are launched, so a bad token or Agent endpoint fails once with an actionable startup error instead of leaving the frontend proxy retrying a dead Agent. The script is intentionally not named `doctor` because pnpm 10 already owns `pnpm doctor` as a package-manager diagnostic command. The example development configuration already includes the Vite origin required by the exact Origin check. In development, the root `pnpm dev` launcher reads the same `PALMTTY_CONFIG`, derives the local Agent URL from `server.host`/`server.port`, and injects it into Vite as `PALMTTY_AGENT_URL`; an explicitly supplied `PALMTTY_AGENT_URL` still overrides the derived target. Vite uses strict port 5173 so it cannot silently move to a different untrusted Origin.

## Secure remote access / 安全远程访问

Recommended order:

1. **Private network + HTTPS**, for example Tailscale Serve.
2. **HTTPS reverse proxy**, for example `HTTPS -> QNAP/Caddy -> PalmTTY`.
3. Keep the PalmTTY upstream port private.

Normal non-loopback startup requires authentication, Secure Cookie and an explicit trusted Origin. PalmTTY refuses unsafe normal-mode startup unless the operator deliberately enables the development-only insecure LAN override.

Deployment references:

- [QNAP/reverse-proxy example](examples/qnap-reverse-proxy.yaml)
- [Caddy example](examples/Caddyfile.example)
- [Community security guide](docs/community/security.md)
- [Security policy](SECURITY.md)

## Repository quality gates / 质量门禁

Every repository-wide change is expected to pass:

```powershell
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build

# same acceptance path:
pnpm check
```

CI runs with a committed `pnpm-lock.yaml` and `--frozen-lockfile` on Windows and Ubuntu. Pull requests also receive a production-dependency vulnerability audit and CodeQL analysis.

## Documentation / 文档

PalmTTY keeps four documentation layers so implementation facts, contributor guidance, owner review and AI execution rules do not collapse into one README:

| Layer | Purpose |
|---|---|
| [Community](docs/community/README.md) | bilingual build, architecture, security and development guidance |
| [Standards](docs/standards/README.md) | upstream standards and authoritative references |
| [Owner](docs/owner/README.md) | 中文架构审查与路线文档 |
| [AI](docs/ai/README.md) | invariants, current implementation state and code↔docs synchronization contract |

Behavior-changing work must follow [`.agents/skills/docs-sync/SKILL.md`](.agents/skills/docs-sync/SKILL.md).

## Project governance / 项目治理

- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)
- [Support](SUPPORT.md)
- [Governance](GOVERNANCE.md)
- [Changelog](CHANGELOG.md)
- [Release process](RELEASING.md)
- [Roadmap](docs/owner/roadmap.md)

## Repository layout

```text
apps/
  agent/       Fastify control plane + durable per-session Worker runtime + node-pty
  web/         React + xterm.js mobile PWA
packages/
  protocol/    shared HTTP/WebSocket schemas
  config/      YAML configuration schemas
docs/
  community/
  standards/
  owner/
  ai/
.agents/
  skills/docs-sync/SKILL.md
  skills/palmtty-theme/SKILL.md
  skills/palmtty-theme-review/SKILL.md
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
