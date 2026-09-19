<div align="center">

# PalmTTY

**Your dev shell, in your palm.**  
**把开发终端放进手掌里。**

Mobile-first · self-hosted · Windows-first · PowerShell 7 · ConPTY · xterm.js

[![CI](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml/badge.svg)](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml)
[![CodeQL](https://github.com/hamburger-os/PalmTTY/actions/workflows/codeql.yml/badge.svg)](https://github.com/hamburger-os/PalmTTY/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.11-339933?logo=node.js&logoColor=white)](package.json)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](docs/owner/roadmap.md)

</div>

> [!WARNING]
> PalmTTY exposes an interactive shell with the privileges of the Windows user running the Agent. Treat compromise as workstation compromise. Use a private HTTPS entry point or an authenticated HTTPS reverse proxy; do not expose an unauthenticated Agent port to the Internet.

PalmTTY is a mobile-first, self-hosted remote development terminal for Windows 11, PowerShell 7, Codex, Git and other terminal-based developer tools. It is designed for the moment when your development workstation is elsewhere but your phone is in your hand.

PalmTTY 是一个面向手机、自托管的远程开发终端，首要支持 Windows 11 + PowerShell 7 + ConPTY，可直接运行 Codex、Git 与其他 CLI 开发工具。

## Status / 当前状态

PalmTTY is **alpha**. The repository is passing Windows and Ubuntu CI with end-to-end Fastify HTTP/WebSocket + SessionManager lifecycle coverage through a deterministic PTY adapter, plus a Windows-only smoke test that uses real node-pty to spawn PowerShell 7 through ConPTY, resize the PTY and round-trip Unicode. Real phone + real workstation + long-running Codex hardening is still ongoing.

| Capability | Alpha status |
|---|---|
| Windows / PowerShell 7 / ConPTY | Implemented and exercised in Windows CI |
| Browser or network disconnect | PTY survives while the Agent stays alive |
| Reconnect | Sequence replay + server-side terminal snapshot fallback |
| Mobile terminal | xterm.js PWA, special-key bar, multiline composer |
| Authentication | Single-user bootstrap token + HttpOnly session cookie |
| Internet exposure | HTTPS/private-network deployment only |
| Agent restart persistence | **Not implemented yet** |
| Multi-user ACL | **Not implemented** |
| Tagged release | **Not published yet** |

## Why PalmTTY / 为什么做 PalmTTY

PalmTTY is intentionally narrower than a browser IDE:

- **Keep the real shell on your workstation.** The Agent owns the PTY; the browser is only a client.
- **Survive mobile reality.** WebSocket reconnect, bounded replay, snapshot recovery and application heartbeat are built around Wi-Fi/cellular switching and backgrounded tabs.
- **Keep remote authority explicit.** The browser selects only configured workspaces; it cannot submit arbitrary working directories or shell executables.
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
 ├─ workspace allowlist
 ├─ bounded Session Manager
 ├─ headless xterm snapshot + sequenced replay
 └─ static Web/PWA
    │
 node-pty
    │
  ConPTY
    │
PowerShell 7
    │
Codex / Git / npm / dotnet / ...
```

A browser disconnect does **not** kill the PTY while the Agent process remains alive. Agent-restart persistence requires the planned independent Session Worker architecture and is deliberately not claimed today.

## Quick start on Windows 11 / 快速开始

Requirements:

- Windows 11
- Node.js 22.11+
- Corepack / pnpm
- PowerShell 7 (`pwsh`)

```powershell
git clone https://github.com/hamburger-os/PalmTTY.git
cd PalmTTY

corepack enable
pnpm install --frozen-lockfile

Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
# Edit the workspace path in palmtty.local.yaml.

$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"

pnpm check
pnpm start
```

Open `http://127.0.0.1:7688` and sign in with the access token.

For development, run `pnpm dev`. The example development configuration already includes the Vite origin that is needed for the exact Origin check.

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
  agent/       Fastify + auth + session manager + node-pty
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
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
