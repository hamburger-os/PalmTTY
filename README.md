# PalmTTY

[![CI](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml/badge.svg)](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml)

**Your dev shell, in your palm. / 把开发终端放进手掌里。**

PalmTTY is a mobile-first, self-hosted remote development terminal for Windows 11, PowerShell 7, Codex and other terminal-based developer tools.

PalmTTY 是一个面向手机、自托管的远程开发终端，首要支持 Windows 11 + PowerShell 7 + ConPTY，可直接运行 Codex 等 CLI 开发工具。

> Status / 状态: **alpha**. Windows/Ubuntu CI is green, including a real Windows PowerShell 7/ConPTY Unicode smoke test. Mobile/Codex real-device hardening is still ongoing.

## What works / 当前能力

- Windows-first PowerShell 7 sessions through `node-pty` / ConPTY
- mobile React + xterm.js PWA
- workspace launcher and persistent PTY sessions across browser/network disconnects
- server-side headless terminal snapshot + bounded sequenced replay
- automatic WebSocket reconnect and snapshot fallback
- mobile Esc/Tab/arrows/Ctrl/Alt shortcuts and multiline prompt composer
- single-user access-token login with HttpOnly/SameSite cookies
- exact WebSocket/HTTP Origin allowlist
- safe non-loopback startup checks, rate limits and bounded buffers
- self-hosted deployment behind a private network or HTTPS reverse proxy

当前已经实现 PowerShell/ConPTY、手机终端、断线重连、服务端终端快照、有界重放、登录认证、Origin 白名单、资源限制以及反向代理部署基础。

## Architecture / 架构

```text
Phone / PWA
    │ HTTPS/WSS
    ▼
VPN or QNAP/Caddy
    │
    ▼
PalmTTY Agent
 ├─ Auth + Origin policy
 ├─ Workspace allowlist
 ├─ Session Manager
 ├─ headless xterm snapshot/replay
 └─ Web PWA
    │
 node-pty
    │
  ConPTY
    │
PowerShell 7
    │
Codex / Git / npm / dotnet / ...
```

**Important:** a browser disconnect does not kill the PTY while the Agent remains alive. Agent-restart persistence is **not** implemented yet; that requires the planned independent session-worker architecture.

## Quick start on Windows 11 / 快速开始

Requirements: Node.js 22+, pnpm/Corepack, PowerShell 7 (`pwsh`).

```powershell
git clone https://github.com/hamburger-os/PalmTTY.git
cd PalmTTY

corepack enable
pnpm install

Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
# Edit the workspace path in palmtty.local.yaml.

$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"

pnpm check
pnpm start
```

Open `http://127.0.0.1:7688` and sign in with the access token.

开发模式可使用 `pnpm dev`；此时还需把 Vite 地址 `http://127.0.0.1:5173` 保留在 `trustedOrigins`。

## Secure remote access / 安全远程访问

PalmTTY is remote shell access. Do **not** expose an unauthenticated Agent port directly to the Internet.

推荐顺序：

1. Tailscale Serve 等“私有组网 + HTTPS”入口；
2. 或 `HTTPS -> QNAP/Caddy -> PalmTTY`；
3. PalmTTY 上游端口只留在内网。

For a reverse-proxy example, see:

- [examples/qnap-reverse-proxy.yaml](examples/qnap-reverse-proxy.yaml)
- [examples/Caddyfile.example](examples/Caddyfile.example)
- [docs/community/security.md](docs/community/security.md)

A normal non-loopback configuration requires authentication, Secure Cookie and an explicit trusted Origin; otherwise the Agent refuses to start unless the operator deliberately enables the unsafe development override.

## Documentation / 文档

PalmTTY uses a four-layer documentation model:

- [Community / 社区开发者](docs/community/README.md) — bilingual setup, architecture, security and contribution docs
- [Standards / 权威标准知识](docs/standards/README.md) — upstream standards and authoritative references
- [Owner / 项目所有者](docs/owner/README.md) — 中文架构审查文档，用于不逐行看 AI 代码时验收成果
- [AI](docs/ai/README.md) — invariants, current state, acceptance and code↔docs synchronization rules

Start from [docs/README.md](docs/README.md).

The repository includes a standard Agent Skills-format documentation workflow at [`.agents/skills/docs-sync/SKILL.md`](.agents/skills/docs-sync/SKILL.md). Behavior-changing work is expected to update code and documentation together.

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

## Development

```powershell
pnpm dev
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
# or all repository-wide checks:
pnpm check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/community/development.md](docs/community/development.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
