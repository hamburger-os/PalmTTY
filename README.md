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

PalmTTY is a mobile-first, self-hosted remote development workbench centered on a durable terminal. Windows 11 remains the primary host target, with native host shells and WSL workspaces; the same host-runtime path is exercised on Ubuntu CI and is designed for Linux/macOS hosts. Each Session workbench keeps the terminal alive while exposing a bounded typed Git source-control surface and read-only workspace file browsing/preview alongside it. Codex and other terminal agents remain ordinary shell workloads.

PalmTTY 是一个以持久终端为核心、面向手机、自托管的远程开发工作台。Windows 11 仍是首要宿主平台，同时支持宿主机 Shell 与 WSL 工作区；同一套宿主运行时也在 Ubuntu CI 中验证，并按 Linux/macOS 宿主扩展设计。每个 Session 工作台在保持终端连接的同时提供有界、typed 的 Git Source Control 与只读工作区文件浏览/预览。Codex 等终端 Agent 仍只是普通 Shell 工作负载。

## Status / 当前状态

PalmTTY is **alpha**. Each terminal now runs in an independent durable Session Worker, so restarting only the HTTP/API Agent does not terminate the live PTY. Windows and Ubuntu CI cover authenticated Worker IPC, Agent restart rediscovery, replay/snapshot recovery and detached-process survival; Windows CI also uses real node-pty + PowerShell 7 / ConPTY for Unicode and resize smoke coverage. Release publication is guarded by pinned-SHA CI/security/license/CodeQL gates. Real phone + real workstation + long-running Codex checks remain recommended release evidence, but are not represented by a manual publication checkbox.

| Capability | Alpha status |
|---|---|
| Windows / PowerShell 7 / ConPTY | Implemented and exercised in Windows CI |
| Linux host runtime | Implemented and exercised on Ubuntu CI |
| WSL runtime | Implemented with runtime validation; real-owner-host validation still required |
| macOS host runtime | Architecture implemented; no repository macOS CI yet |
| Web workspace management | Persistent create/edit/delete with unified terminal profiles (Host shells + WSL distributions), bounded environment variables and multiline startup input |
| UI languages | English and Simplified Chinese |
| Visual themes | Spectrum / Obsidian / Frosted with Quality / Performance rendering modes |
| Browser or network disconnect | PTY survives while the Agent stays alive |
| Reconnect | Sequence replay + server-side terminal snapshot fallback |
| Session lifecycle | Explicit terminate / restart-as-replacement / retained clear; no ambiguous close/kill control |
| Session workbench | Terminal / Git / Files tabs; terminal stays mounted while switching views |
| Mobile terminal | xterm.js PWA, touch special-key bar, on-demand long-text input |
| Authentication | Single-user bootstrap token + HttpOnly session cookie |
| Network exposure | Explicit `local` / `lan` / `reverseProxy` / direct `https` profiles; HTTPS/private entry is recommended |
| Agent restart persistence | Implemented: independent Session Worker + authenticated local rediscovery |
| Current-user autostart | Windows Task Scheduler + console-free native GUI host; Linux systemd user service; Agent restarts after sign-in/user-manager startup |
| Multi-user ACL | **Not implemented** |
| Release process | Guarded manual Release Action: pinned `main` SHA → CI/security/license/CodeQL → native Windows/Linux package + detached installed-runtime smoke → checksums/provenance → annotated tag + verified asset-bearing GitHub Release |

## Why PalmTTY / 为什么做 PalmTTY

PalmTTY is intentionally narrower than a browser IDE:

- **Keep the real shell on your workstation.** A per-session Worker owns the PTY; the Agent and browser are replaceable clients/control planes.
- **Survive mobile reality.** WebSocket reconnect, bounded replay, snapshot recovery and application heartbeat are built around Wi-Fi/cellular switching and backgrounded tabs.
- **Keep remote authority explicit.** Workspace changes are persistent authenticated mutations, not ad-hoc Session parameters. A Workspace may contain bounded environment variables, but Session creation/restart cannot inject temporary cwd/shell/env overrides.
- **Stay AI-vendor-neutral.** Codex, Claude Code, OpenCode and other terminal tools are workloads, not protocol dependencies.
- **Remain self-hosted.** No cloud relay is required by the core architecture.

## Architecture / 架构

```text
Phone / PWA
 ├─ Terminal pane (WSS → Session Worker)
 ├─ Git pane (bounded typed Source Control HTTP API)
 └─ Files pane (workspace-scoped read-only HTTP API)
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

A browser disconnect does **not** kill the PTY. Restarting only the PalmTTY Agent also leaves the independent Session Worker and PTY alive; after the Agent returns, sign in again and reconnect to the same Session. PalmTTY can automatically start the Agent again on Windows/Linux, but it does **not** claim PTY persistence across OS reboot, user logoff, or loss of the Worker process itself. Autostart restores the control plane; persisted Workspaces remain available for creating new Sessions.

## Install / 安装

Normal users do **not** need Node.js, pnpm, or a source checkout. Releases produced by the current Release workflow publish self-contained host runtimes:

- **Windows x64:** `PalmTTY-Setup-X.Y.Z-win-x64.exe` (recommended) and a portable `.zip`.
- **Linux x64:** `palmtty_X.Y.Z_amd64.deb` (recommended on Debian/Ubuntu) and a portable `.tar.gz`.
- Each platform also publishes a CycloneDX SBOM; the Release includes `SHA256SUMS`, and GitHub build-provenance attestations cover the release assets.

The Windows installer is per-user and does not elevate to LocalSystem. It installs PalmTTY under Local AppData, initializes a per-user config and random access token, registers the existing current-user Task Scheduler model, and offers to show the browser address/token at the end. The bundled runtime includes Node.js, PalmTTY production dependencies and the compiled Web UI; the user's machine does not need a separate Node installation.

Installed/portable builds expose the bundled CLI:

~~~text
palmtty init --install-service
palmtty info
palmtty start
palmtty preflight
palmtty service status
palmtty service restart
palmtty service uninstall
palmtty version
~~~

Linux `.deb` installation places the runtime under `/usr/lib/palmtty` and the CLI at `/usr/bin/palmtty`; run `palmtty init --install-service` as the intended PalmTTY user so configuration, credentials and the `systemd --user` service belong to that user. Portable archives keep the same CLI under `bin/`.

普通用户**不再需要安装 Node.js、pnpm 或克隆源码仓库**。Windows 推荐直接下载安装器；Debian/Ubuntu 推荐安装 `.deb`。发行包已经包含 Node 运行时、生产依赖和 Web UI。Windows 安装器按当前用户安装并注册当前用户 Task Scheduler；Linux 由目标用户执行 `palmtty init --install-service` 注册 `systemd --user`。配置、凭据和 Workspace 数据与程序文件分离，因此升级不会覆盖用户状态。

## Build from source on Windows 11 / Windows 11 源码构建

Requirements:

- Windows 11
- Node.js 22.11+
- Corepack / pnpm
- PowerShell 7 (`pwsh`) is the preferred Windows host shell; the Workspace editor exposes one terminal-profile selector containing detected Host shells plus registered WSL distributions, with a Custom fallback for explicit runtime/shell details

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

Open `http://127.0.0.1:17688`, sign in with the access token, then create a workspace from the Web UI. Workspaces are stored separately from `palmtty.local.yaml`. Choose a **Terminal environment** directly: Host shells such as PowerShell 7 and registered WSL distributions such as `Ubuntu-22.04` appear in one selector. Use **Custom** only when explicit runtime/executable/argv control is required. Workspace environment entries use `NAME=value` lines and are applied before the Shell starts; balanced outer quotes are normalized, so copied forms such as `HTTP_PROXY="http://127.0.0.1:10808"` save the same value as the unquoted URL. The startup field accepts multiple lines sent after startup.

`pnpm run preflight` validates the authentication environment, security exposure rules and configured Agent TCP listen endpoint before the Agent starts. Workspace directories and shells are validated when a workspace is created/updated and again when a Session starts or is explicitly restarted. Windows Store/MSIX PowerShell is supported through the current user's App Execution Alias, and resolved host shells are normalized to absolute launch paths before Worker creation. Each new/restarted Windows Host terminal rebuilds its environment from current Machine/User values before Workspace overrides are applied, so a CLI added to the user's PATH after the PalmTTY Agent started can be picked up by **Restart terminal** without restarting the Agent.

For development, run `pnpm dev`. It invokes PalmTTY's `preflight` package script explicitly before Vite and the Agent are launched, so a bad token or Agent endpoint fails once with an actionable startup error instead of leaving the frontend proxy retrying a dead Agent. The script is intentionally not named `doctor` because pnpm 10 already owns `pnpm doctor` as a package-manager diagnostic command. The root launcher reads the same `PALMTTY_CONFIG`, derives the local Agent URL from the exposure profile and `server.port`, and injects it into Vite as `PALMTTY_AGENT_URL`; an explicitly supplied `PALMTTY_AGENT_URL` still overrides the derived target. **Vite listens on `0.0.0.0:5173` by default**, while the Agent follows its exposure profile (the example remains `local`). The launcher enumerates current private/overlay IPv4 addresses and adds only those exact `http://<address>:5173` Origins to the development Agent at runtime, so a phone on the same LAN can use the printed Network URL without modifying persistent Origin policy. Set `PALMTTY_WEB_HOST=127.0.0.1` to opt out of LAN development listening. On Windows, if another LAN device still times out, allow Node.js/PalmTTY TCP 5173 on the Private network profile; PalmTTY never elevates itself or edits firewall rules. Vite keeps strict port 5173 so it cannot silently move to a different untrusted Origin.

## Build from source on Linux / Linux 源码构建

The Linux Host runtime is implemented and exercised by Ubuntu CI. A basic source checkout uses the same Agent/Web build as Windows:

```bash
git clone https://github.com/hamburger-os/PalmTTY.git
cd PalmTTY

corepack enable
pnpm install --frozen-lockfile
cp examples/palmtty.example.yaml palmtty.local.yaml

export PALMTTY_CONFIG="$PWD/palmtty.local.yaml"
export PALMTTY_ACCESS_TOKEN="replace-with-a-long-random-secret"

pnpm run preflight
pnpm check
pnpm start
```

With the example config, open `http://127.0.0.1:17688`. Linux uses the native Host runtime and Unix-domain-socket Worker IPC; WSL is a separate Windows runtime adapter.

## Autostart / 开机自启

Installed builds use `palmtty service install|status|restart|uninstall`. `palmtty init --install-service` creates the current user's default config/credentials when absent and installs the service in one step. Windows uses the same least-privilege Task Scheduler + GUI-subsystem host architecture, but the host is compiled and verified during release packaging rather than compiled on the user's workstation. Linux uses `systemd --user` with `KillMode=process`.

Source checkouts retain `pnpm autostart ...` for contributor/development validation. Both paths keep secrets in a separate env file and preserve the existing rule that Agent restart must not redefine independent Session Worker lifetime. See [Autostart / 开机自启](docs/community/autostart.md) for details.

## Network exposure / 网络暴露

PalmTTY uses an explicit exposure profile instead of independent low-level security switches:

- `local` — default; Agent binds loopback and accepts only local Origins.
- `lan` — listens on IPv4 `0.0.0.0`, requires authentication, rejects non-private client source addresses, discovers exact private/overlay IPv4 Origins automatically, and intentionally uses unencrypted HTTP. Keep the host firewall scoped to trusted Private networks.
- `reverseProxy` — HTTP upstream plus explicit HTTPS browser Origins; Secure cookies are derived automatically. Use this for Tailscale Serve, Caddy, QNAP, Nginx, and similar ingress.
- `https` — Agent terminates TLS directly using configured certificate/key files and explicit HTTPS Origins.

For normal remote use, prefer a private HTTPS entry point or authenticated HTTPS reverse proxy. Keep an HTTP reverse-proxy upstream private/firewalled.

Deployment references:

- [Private-LAN HTTP example](examples/palmtty.lan.example.yaml)
- [Direct HTTPS example](examples/palmtty.https.example.yaml)
- [QNAP/reverse-proxy example](examples/qnap-reverse-proxy.yaml)
- [Caddy example](examples/Caddyfile.example)
- [Community security guide](docs/community/security.md)
- [Security policy](SECURITY.md)

## Repository quality gates / 质量门禁

Every repository-wide change is expected to pass:

```powershell
pnpm docs:check
pnpm typecheck
pnpm scripts:check
pnpm test
pnpm build

# same acceptance path:
pnpm check
```

CI runs with a committed `pnpm-lock.yaml` and `--frozen-lockfile` on Windows and Ubuntu. Pull requests also receive a production-dependency vulnerability audit, a fail-closed production dependency license-policy review, and CodeQL analysis. Tagged releases are published only through the guarded [Release workflow](RELEASING.md), which re-runs those gates against one immutable `main` SHA before creating the annotated tag and GitHub Release.

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
