<!-- bilingual -->
# Getting started / 开始使用

## English

### Install a release

For normal use, download a packaged Release instead of cloning the repository.

- Windows x64: use `PalmTTY-Setup-X.Y.Z-win-x64.exe`. The per-user installer bundles Node.js 24 LTS, production dependencies and the compiled Web UI, initializes a user config/token when absent, and registers the current-user startup task.
- Debian/Ubuntu x64: install `palmtty_X.Y.Z_amd64.deb`, then run `palmtty init --install-service` as the intended PalmTTY user.
- Portable users can extract the Windows `.zip` or Linux `.tar.gz` and use the bundled `bin/palmtty` command.

Useful installed commands:

~~~text
palmtty info
palmtty preflight
palmtty start
palmtty service status
palmtty service restart
palmtty version
~~~

Release assets include per-platform CycloneDX SBOM files plus `SHA256SUMS`; GitHub build-provenance attestations are generated before the Release is promoted.

### Source-build requirements


- Node.js >=24.22.1 within major 24; `.node-version` pins the tested development and CI baseline.
- pnpm through Corepack.
- Windows 11 is the primary host target. PowerShell 7 is the default Windows host-shell experience.
- WSL is optional. Linux host runtime is exercised on Ubuntu CI. macOS uses the same host-runtime design but is not covered by repository CI yet.

### Build and start

~~~powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm run preflight
pnpm check
pnpm start
~~~

`PALMTTY_ACCESS_TOKEN` must contain at least 16 characters; use a long random secret for real deployments. `pnpm run preflight` validates authentication/security settings and the configured Agent TCP endpoint. Workspace launch targets are no longer stored in the YAML configuration, so host startup is not blocked by a stale project path.


### Runtime choices

- Open **Terminal** settings for the single **Terminal environment** selector. Known Host shells appear directly, and each registered WSL distribution appears as its own profile (for example `Ubuntu-22.04` or `Debian`). Host/WSL runtime details are exposed only under **Custom**.
- WSL profile discovery uses `wsl.exe --list --quiet`; it does not start distributions merely to populate the selector. A selected WSL profile uses that distribution's default shell unless Custom overrides it, and its working directory remains a Linux path.
- Workspace environment uses one `NAME=value` entry per line and is applied before the shell starts. Balanced outer single/double quotes are accepted and removed, so both `HTTP_PROXY=http://127.0.0.1:10808` and `HTTP_PROXY="http://127.0.0.1:10808"` persist the same URL; unmatched outer quotes are rejected. On Windows, each new/restarted terminal also refreshes the current Machine/User environment and PATH, so CLIs installed after the PalmTTY Agent started can be discovered by a new PTY. WSL workspace variables are forwarded through `WSLENV`.
- Shell arguments remain explicit argv values. Startup command is a persisted shell-launch command in `workspace.terminal` and now runs via shell argv rather than fixed-delay PTY typing. Supported shells: PowerShell, cmd, bash, zsh, fish, sh, dash, ksh, Nu. Explicit WSL shells use the same model; the default WSL profile chooses `$SHELL` through `/bin/sh`. Unknown shell launch configurations with a startup command are rejected. Startup commands may appear in OS process arguments: never embed passwords or API keys. Workspace environment is persistent local configuration, not a secret vault.
- In **Terminal → Startup command**, choose **Pi** to fill `pi` (alongside Codex, Claude Code and other CLI presets). Install Pi in the selected Host/WSL environment first (`npm install -g --ignore-scripts @earendil-works/pi-coding-agent`), (npm install requires Node.js 22.19+) and ensure the `pi` command is available on that shell's PATH. A preset only fills the field; it does not install the CLI. The mobile keybar offers Shift+Enter, Alt+Enter and Ctrl+Q, and xterm explicitly enables Kitty keyboard support. Real mobile/browser/IME compatibility must still be validated.

### Official VS Code Web and Harness

Harness may launch on the Agent's loopback. Cross-device DSH still requires separate protected HTTPS, upstream `--public-url` and `--trusted-host`, and independent authentication.

### Linux host quick start

The Linux Host runtime is implemented and exercised on Ubuntu CI. Use the same example config with POSIX shell syntax:

~~~bash
corepack enable
pnpm install --frozen-lockfile
cp examples/palmtty.example.yaml palmtty.local.yaml
export PALMTTY_CONFIG="$PWD/palmtty.local.yaml"
export PALMTTY_ACCESS_TOKEN="replace-with-a-long-random-secret"
pnpm run preflight
pnpm check
pnpm start
~~~

The example config listens on `127.0.0.1:17688`. Linux uses native Host shells and Unix-domain-socket Worker IPC.

For current-user startup registration on Windows or Linux, see [autostart.md](autostart.md). Autostart brings the Agent back; it does not preserve an old PTY across OS reboot.

### Development mode

~~~powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
~~~

`pnpm dev` runs the same Agent preflight before starting the Agent and Vite. The root launcher derives the local Agent URL from the validated config and injects it as `PALMTTY_AGENT_URL`. Vite listens on `0.0.0.0:5173` by default, so the development UI is immediately reachable from the same private LAN. The launcher enumerates the machine's RFC1918, IPv4 link-local and 100.64/10 private/overlay IPv4 addresses and adds only those exact `http://<address>:5173` Origins to the development Agent at runtime. The Agent itself still follows the exposure profile in `palmtty.local.yaml`; the example remains `local`. You do not need to persist development Origins in the config.

Vite prints the reachable LAN URLs. On Windows, if another device still times out, allow Node.js/PalmTTY TCP 5173 on the **Private** network profile; PalmTTY does not elevate itself or edit firewall rules. To opt out of LAN development listening, set `PALMTTY_WEB_HOST=127.0.0.1` before `pnpm dev`.

Do **not** expose the Vite development server directly to the Internet. For remote/non-development access, use a private overlay or the authenticated HTTPS reverse-proxy configuration described in [security.md](security.md).

For QNAP/Caddy-style TLS termination, start from `examples/qnap-reverse-proxy.yaml`: the browser-facing Origin stays HTTPS/WSS, while the private upstream may be HTTP. The proxy rule must explicitly support **HTTP + WebSocket** (not HTTP-only forwarding) to the PalmTTY Agent port and preserve WebSocket Upgrade/subprotocol negotiation. If the Web UI loads and REST calls work but the terminal stays in reconnecting state, verify this WebSocket-capable proxy mode first. Keep the upstream port private/restricted to the proxy or trusted LAN.

## 中文

### 安装发行版

正常使用时优先下载 Release 发行包，不需要克隆仓库。

- Windows x64：使用 `PalmTTY-Setup-X.Y.Z-win-x64.exe`。这是当前用户安装器，已包含 Node.js 24 LTS、生产依赖与 Web UI；首次安装会在用户配置不存在时初始化 config/token，并注册当前用户启动任务。
- Debian/Ubuntu x64：安装 `palmtty_X.Y.Z_amd64.deb` 后，以真正运行 PalmTTY 的用户执行 `palmtty init --install-service`。
- Portable 用户可以解压 Windows `.zip` 或 Linux `.tar.gz`，直接使用其中的 `bin/palmtty`。

常用安装版命令：

~~~text
palmtty info
palmtty preflight
palmtty start
palmtty service status
palmtty service restart
palmtty version
~~~

Release 同时提供每个平台的 CycloneDX SBOM 与 `SHA256SUMS`，并在正式发布前生成 GitHub build provenance attestation。

### 源码构建环境要求


- Node.js 24.22.1 或更高的 Node 24 版本（不支持 Node 22 或 25+）；`.node-version` 是测试的 CI 版本来源。
- 通过 Corepack 使用 pnpm。
- Windows 11 仍是首要宿主平台；Windows 宿主 Shell 默认使用 PowerShell 7。
- WSL 为可选运行环境。Linux 宿主运行时已经在 Ubuntu CI 中执行；macOS 使用同一宿主运行时设计，但仓库当前没有 macOS CI。

### 构建运行

~~~powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm run preflight
pnpm check
pnpm start
~~~

`PALMTTY_ACCESS_TOKEN` 至少需要 16 个字符，实际部署应使用长随机 secret。`pnpm run preflight` 只检查认证/安全设置与 Agent TCP 监听端点。Workspace 启动目标不再写入 YAML，因此某个旧项目目录失效不会阻塞整个 Agent 启动。

打开配置的 Agent 地址并登录，然后直接在 Web UI 中创建第一个工作区。`pnpm build` 之后，无论 `pnpm start` 还是 autostart，编译后的 Web UI 都由 Agent 自己提供；示例配置使用 `server.exposure.mode: local`，地址是 `http://127.0.0.1:17688/`。端口 `5173` 只用于开发。若明确需要家庭/开发局域网 HTTP 直连，可使用 `examples/palmtty.lan.example.yaml` 或把 `server.exposure.mode` 改为 `lan`；Agent 会监听 IPv4 `0.0.0.0`、强制要求认证、拒绝非私有来源地址，并只接受自动检测到的私有/overlay IPv4 精确 Origin。Windows 防火墙仍应把 Agent 端口的入站范围限制在可信的 Private 网络。PalmTTY 会把工作区目录持久化到当前用户的应用数据目录。浏览器只能通过已认证且受精确 Origin 保护的 API 持久化创建/编辑/删除工作区；真正创建 Session 时仍只发送 workspace ID。

### 运行环境

- 正常编辑流程只有一个**终端环境**选择器：已知 Host Shell 直接出现，每个已注册 WSL 发行版也作为一级 Profile 出现，例如 `Ubuntu-22.04`、`Debian`；只有 **自定义** 才展开 Host/WSL runtime 细节。
- WSL Profile 通过 `wsl.exe --list --quiet` 枚举，不会为了填下拉框而启动发行版；选中后默认使用该发行版自己的默认 Shell，工作目录仍必须是 Linux 路径。
- 新建/修改工作区时会验证目录、运行环境和 Shell；创建 Session 与显式“重启终端”前还会再次验证。
- 工作区环境变量使用每行一个 `NAME=value`，在 Shell 启动前应用。最外层成对单引号/双引号会自动去除，因此 `HTTP_PROXY=http://127.0.0.1:10808` 与 `HTTP_PROXY="http://127.0.0.1:10808"` 会保存成同一个 URL；不成对引号会直接拒绝。Windows 每次新建/重启终端还会重新读取当前 Machine/User 环境与 PATH，因此 Agent 启动后新安装到用户 PATH 的 CLI 可被新 PTY 看见；WSL 通过 `WSLENV` 转发配置变量。
- Shell 参数继续按独立 argv 传递；启动命令支持多行，通过 Shell 启动参数运行，而不是固定延时的键盘模拟输入。支持 PowerShell、cmd、bash、zsh、fish、sh、dash、ksh 和 Nu；WSL 默认配置使用发行版 `$SHELL`。未知 Shell 对启动命令会明确报错；命令可能在本机进程参数中可见，不要包含密码或 API 密钥。Workspace environment 是本机持久化配置，不是密钥保险箱。

在 **Terminal → 启动命令** 中点击 **Pi**，即可快捷填写 `pi`，与 Codex、Claude Code 等工具共用预设入口。请先在所选 Host/WSL 环境中安装 `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`，npm 安装要求 Node.js 22.19 或以上版本；确认该 Shell 的 PATH 能找到 `pi`。预设仅填写命令，不负责安装。手机快捷栏支持 Shift+Enter、Alt+Enter 和 Ctrl+Q，xterm 已启用 Kitty 键盘协议；实际 CLI 与移动浏览器的中文 IME、快捷键仍需真机验证。

如果 Windows 在探测 Agent 端口时报告 `EACCES/WSAEACCES`，先区分普通监听进程与 Windows 排除/保留端口：

~~~powershell
Get-NetTCPConnection -LocalPort 17688 -ErrorAction SilentlyContinue
netsh interface ipv4 show excludedportrange protocol=tcp
~~~

如果配置端口不可用，请修改 `palmtty.local.yaml` 中的 `server.port`，重新执行 `pnpm run preflight`。

### 官方 VS Code Web 与 Harness

Harness 可由 Agent 在回环地址启动；手机跨设备访问仍需独立安全 HTTPS、DSH `--public-url` / `--trusted-host` 与上游登录认证。

### Linux 宿主快速开始

Linux Host runtime 已实现并进入 Ubuntu CI。使用同一份示例配置，只需改用 POSIX Shell 语法：

~~~bash
corepack enable
pnpm install --frozen-lockfile
cp examples/palmtty.example.yaml palmtty.local.yaml
export PALMTTY_CONFIG="$PWD/palmtty.local.yaml"
export PALMTTY_ACCESS_TOKEN="replace-with-a-long-random-secret"
pnpm run preflight
pnpm check
pnpm start
~~~

示例配置监听 `127.0.0.1:17688`。Linux 使用原生 Host Shell 与 Unix-domain-socket Worker IPC。

Windows/Linux 当前用户自启动请查看 [autostart.md](autostart.md)。自启动只负责把 Agent 拉起，不代表 OS reboot 后旧 PTY 仍存在。

### 开发模式

~~~powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
~~~

`pnpm dev` 会先执行同一套 Agent preflight，再启动 Agent 与 Vite。根启动器从已验证配置推导本地 Agent URL，并通过 `PALMTTY_AGENT_URL` 注入 Vite。Vite 默认监听 `0.0.0.0:5173`，因此同一私有局域网里的手机/电脑可以直接访问。启动器会枚举当前机器的 RFC1918、IPv4 link-local 与 100.64/10 私有/overlay IPv4 地址，只把对应的 `http://<address>:5173` **精确 Origin** 临时加入 development Agent；Agent 本身仍按 `palmtty.local.yaml` 的 exposure profile 监听，示例配置仍保持 `local`。`pnpm dev` 不需要把开发 Origin 持久化到配置。

Vite 会打印可访问的 LAN URL。Windows 上如果其他设备仍然超时，请允许 Node.js/PalmTTY 的 TCP 5173 通过 **专用网络（Private）** 防火墙；PalmTTY 不会自行提权或修改防火墙。若要关闭默认 LAN 开发监听，可在 `pnpm dev` 前设置 `PALMTTY_WEB_HOST=127.0.0.1`。

不要把 Vite 开发服务器直接暴露到公网。正式/远程访问应使用私有组网，或采用 [security.md](security.md) 中描述的 HTTPS 认证反向代理方案。

如果由 QNAP/Caddy 终止 TLS，可从 `examples/qnap-reverse-proxy.yaml` 开始：浏览器侧保持 HTTPS/WSS，私网 upstream 可以使用 HTTP；反向代理规则必须明确选择支持 **HTTP + WebSocket** 的模式（不能只转普通 HTTP），并把 WebSocket Upgrade/子协议协商转发到 PalmTTY Agent 端口。如果页面和普通 REST API 正常但终端一直“正在重连”，应首先检查这一 WebSocket 代理模式。上游端口仍应只对代理或可信局域网开放。

### Optional local Qwen3-TTS reader / 可选本地 Qwen3-TTS

**English**

Browser voices work without additional host dependencies. The reader only lists voices whose browser-declared language is Chinese (for example zh-CN, zh-TW, or Cantonese yue-HK), regardless of their display name. A local Chinese voice is preferred; online or unknown-origin Chinese voices require explicit per-voice consent before speech or preview. If none appears, enable/install a Chinese speech voice in the device/browser settings and reopen the reader.

To enable local Qwen speech, prepare Python 3.12 in a **separate virtual environment** on the same host as PalmTTY. Install `qwen-tts` from the project's official distribution. Download one of the official Qwen3-TTS-12Hz `0.6B-CustomVoice` or `1.7B-CustomVoice` models to an operator-controlled local directory first. Example with an already-installed ModelScope CLI:

~~~bash
modelscope download --model Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice --local_dir ./qwen3-tts-model
~~~

Set an independent random secret of 32–512 characters in `PALMTTY_QWEN_TOKEN` for **both** the Python process and the PalmTTY Agent (use the existing private Agent environment file for autostart); never place the value in the YAML or Workspace environment. Start the optional server from the source checkout:

~~~bash
python scripts/qwen3-tts-server.py --model-dir ./qwen3-tts-model --model 1.7b --device cuda --port 18765
~~~

Installed builds also provide `tools/qwen3-tts-server.py` under their installation directory. For CPU-only systems, choose `--device cpu`; verify available RAM and performance independently. Use `--model 0.6b` only with the matching 0.6B CustomVoice directory. Model downloads can be several GB and are never triggered by ordinary PalmTTY startup.

Enable the Agent proxy with:

~~~yaml
speech:
  qwen:
    enabled: true
    port: 18765
~~~

Restart the Agent, then select **Qwen3-TTS** in Files → Read aloud. The model sidecar must be managed separately; PalmTTY does not install its Python dependencies, preload models, or run arbitrary model installer commands. Qwen runs on the PalmTTY host, not in Safari or the phone. The Python endpoint binds to 127.0.0.1 and needs the private token. Windows Agent + WSL Python cross-networking is not implied by localhost: run the sidecar on the matching host or explicitly secure a port-forward setup. Mobile Safari may require a second user tap after preparing audio and background playback is not guaranteed.

**中文**

浏览器原生语音无需额外主机依赖：列表仅显示浏览器声明支持中文的音色（如 zh-CN、zh-TW、粤语 yue-HK），不依音色名称猜测语言；默认优先设备本地中文音色。联网或来源未知的中文音色在试听与播放前都需要当前阅读中明确授权；若列表为空，请在设备／浏览器设置中安装或启用中文语音后重新打开阅读器。

Qwen3-TTS 使用**单独的 Python 3.12 虚拟环境**，从官方来源安装 `qwen-tts`，并手工下载匹配的 `Qwen3-TTS-12Hz-0.6B-CustomVoice` 或 `1.7B-CustomVoice` 模型到宿主机私有目录。参考上述命令。为 Python 服务和 PalmTTY Agent 设置同一个独立随机 `PALMTTY_QWEN_TOKEN`（32–512 字符），建议存放于仓库外的用户私有环境文件，严禁写入 YAML、Workspace environment 或命令行参数。运行 `scripts/qwen3-tts-server.py`，打包安装版为安装目录下的 `tools/qwen3-tts-server.py`；显卡运行用 `--device cuda`，CPU 使用 `--device cpu`，0.6B/1.7B 的 `--model` 必须匹配已下载目录。依上方 YAML 启用 `speech.qwen`，重启 Agent 后在「文件 → 朗读」选择 Qwen3-TTS。

Qwen 模型及 Python 依赖是可选独立安装，不随主安装包分发或自动下载。服务只能监听本机回环地址，需要自行管理其启动和生命周期；Windows 主机和 WSL 不是自动共享同一个回环地址。手机只接收音频，不运行模型；iOS Safari 首次媒体解锁及后台播放可能需要额外手动操作或无法持续。


### Node 24 host upgrade / Node 24 主机升级

**English:** Source mode requires Node 24 LTS (at least the `.node-version` security baseline). Switch the host Node binary and rerun `pnpm install --frozen-lockfile` to rebuild native `node-pty` for the current ABI; validate with `pnpm check`. If the source-mode autostart recorded an older absolute Node path, reinstall it. Windows/Linux release archives bundle Node 24. End existing Node 22 Terminal Sessions before upgrade rather than leave detached old Workers alongside the new Agent. No dual-Node compatibility layer is provided.

**中文：** 源码部署只支持 Node 24 LTS（不低于 `.node-version` 版本）。切换本机 Node 后重新运行 frozen-lockfile 安装，重建原生 `node-pty`，完成 `pnpm check`；如源码自启动记录的 Node 绝对路径变化，需重装自启动。正式安装包已内置 Node 24。升级前建议结束旧 Node 22 的终端 Worker，避免旧版 Worker 与新 Agent 混跑；不增加双版本兼容层。


### One-command local deployment / 一键本机部署

`pnpm deploy:local [--config <path>] [--env-file <path>]` installs frozen dependencies, builds, preflights and registers current-user startup before checking configured autoStart apps. Windows can reuse an existing installation with no options. Use explicit managed/external objects from [Web integrations](web-integrations.md), not URL strings. Local ports default to Code 8000 and Harness 3080; a phone cannot reach the host through its own loopback. DNS/TLS/NAS requires separate first-time setup. Explicit interactive `pnpm app:authorize <vscodeWeb|harness>` displays the private local first-sign-in URL; do not record/share it.

上述命令完成本机构建、预检、自启和就绪检查，Windows 无参数复用安装路径；应用采用明确对象配置。Code/Harness 默认回环端口为 8000/3080，手机 HTTPS 域名与代理首次单独配置。本机明确执行交互授权命令可获取私有首次登录地址，勿记录或分享。自启不表示 OS 重启后旧终端存活。
