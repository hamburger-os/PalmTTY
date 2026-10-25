<div align="center">

# PalmTTY

**Your dev shell, in your palm.**  
**把开发终端放进手掌里。**

Mobile-first · self-hosted · Windows-first · Host + WSL runtimes · xterm.js

[![CI](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml/badge.svg)](https://github.com/hamburger-os/PalmTTY/actions/workflows/ci.yml)
[![CodeQL](https://github.com/hamburger-os/PalmTTY/actions/workflows/codeql.yml/badge.svg)](https://github.com/hamburger-os/PalmTTY/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-24%20LTS-339933?logo=node.js&logoColor=white)](package.json)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](docs/owner/roadmap.md)

</div>

> [!WARNING]
> PalmTTY exposes an interactive shell with the privileges of the OS user running the Agent. Treat compromise as workstation compromise. Use a private HTTPS entry point or an authenticated HTTPS reverse proxy; do not expose an unauthenticated Agent port to the Internet.

PalmTTY is a mobile-first self-hosted remote development workbench centered on durable Terminal Sessions, workspace Git/Files/Artifacts, and optional external links to official VS Code Web and DeepSeek Harness. Codex/Claude/Pi CLIs remain ordinary terminal workloads.

PalmTTY 是一个面向手机的自托管远程开发工作台。Windows Host、WSL、Linux Host 使用独立持久的 Terminal Worker；Git/Files/Artifacts 保持工作区工具。VS Code Web 和独立的 DeepSeek Harness 只提供可选外部入口，不接管第三方进程、认证与会话。Codex CLI 仍是终端启动命令。

## Terminal touch controls / 手机终端触摸控制

On touch devices, the terminal starts in **Browse** mode: swipe to review local history when mouse tracking is off, without sending mouse events to CLI apps. Switch to **Interact** from the keybar to send valid SGR mouse actions to a full-screen TUI. Alternate-screen apps have no local scrollback, so use Interact or app-specific keyboard navigation to scroll inside them. Legacy X10 binary mouse input is intentionally unsupported and malformed reports are dropped.

手机终端默认“浏览”：未启用鼠标跟踪时可以原生滑动查看终端历史，且不会将鼠标事件误发给 CLI；如需操作 TUI 内部的滚动和点击，使用快捷键栏中的“交互”。备用屏幕无本地滚动历史，请使用交互模式或应用快捷键。旧式 X10 二进制鼠标协议明确不支持，异常鼠标报告直接丢弃。

## Status / 当前状态


| Capability | Alpha status |
|---|---|
| Windows / PowerShell 7 / ConPTY | Implemented and exercised in Windows CI |
| Linux host runtime | Implemented and exercised on Ubuntu CI |
| WSL runtime | Implemented with runtime validation; real-owner-host validation still required |
| macOS host runtime | Architecture implemented; no repository macOS CI yet |
| UI languages | English and Simplified Chinese |
| Visual themes | Spectrum / Obsidian / Frosted with Quality / Performance rendering modes |
| Browser or network disconnect | PTY survives while the Agent stays alive |
| Reconnect | Short disconnects preserve xterm with bounded replay; long suspension or renderer congestion restores a bounded canonical snapshot (PTY survives) |
| Session lifecycle | Explicit terminate / restart-as-replacement / retained clear; no ambiguous close/kill control |
| Mobile terminal | xterm.js PWA, touch special-key bar, on-demand long-text input |
| Novel reading / 小说朗读 | Read-only novel reader with all browser voices (local-first, remote opt-in), optional private-host Qwen3-TTS CustomVoice, saved chapter/paragraph offsets, bounded paging (8 MiB / 20,000 paragraphs) |
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

## Managed Web applications / 受管理的 Web 应用

VS Code Web and DeepSeek Harness are always visible as independent applications on PalmTTY's home screen, even when no Workspace exists or installation/remote access is unavailable. No separate application URLs are required for local discovery. On authenticated login PalmTTY detects official Windows VS Code installations and attempts an isolated, pinned DSH Web user-local install/start (`@deepseek-ai/dsh@0.2.1-rc.2`) using the host's npm installation. `npm` may not be present in standalone PalmTTY release packages; that condition is diagnosed rather than silently installing OS tools or escalating privileges.

Microsoft does **not permit hosting the official VS Code Server as a service**. PalmTTY detects VS Code but deliberately does not install/start/stop a VS Code Server daemon; launch it under an interactive Windows user session in accordance with its terms. Codex CLI remains a Terminal command. Harness independently owns its workspaces, sessions, credentials and model authentication.

Both applications are separate security principals. For an iPhone behind an existing NAS single-origin reverse proxy, a running local service is **not yet a safely accessible remote service**. PalmTTY does not route third-party JavaScript through its authenticated Origin or transmit loopback token links to remote browsers. An optional dedicated external HTTPS entry can be configured only after the operator has provisioned a separate trusted origin:

```yaml
integrations:
  vscodeWeb: "https://code.example.test/"
  harness: "https://harness.example.test/"
```

The same YAML without an `integrations` section remains valid: it automatically discovers local tools and shows diagnostics. See [Web application management](docs/community/web-integrations.md).

VS Code Web 和 Harness 在 UI 始终可见。登录后自动检测工具，并尝试使用主机上已有 npm 在当前用户目录安装和启动固定版本 Harness；安装版不保证系统中已装 npm，失败会显示明确状态。官方 VS Code Server 不允许作为服务托管，故 PalmTTY 只检测安装，不代替用户后台托管。手机通过现有 NAS 单 HTTPS 地址访问时，回环服务不会自动变成安全的远端页面；需要独立 HTTPS Origin，不能直接在已登录 PalmTTY 同源代理第三方代码。

## Architecture / 架构

```text
Browser/PWA -> PalmTTY Agent (auth, Workspace, Git, Files)
                    -> detached per-session Terminal Worker -> Host/WSL PTY
External browser links -> separately running VS Code Web / DSH Web
```

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
- Node.js 24.22.1+ (Node 24 LTS only, with the CI baseline pinned in `.node-version`).
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
