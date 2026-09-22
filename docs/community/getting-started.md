<!-- bilingual -->
# Getting started / 开始使用

## English

### Requirements

- Node.js 22 or newer.
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

Open the configured Agent URL, sign in, and create the first workspace in the Web UI. After `pnpm build`, both `pnpm start` and autostart serve the compiled Web UI from the Agent itself; with the example config (`server.exposure.mode: local`) the URL is `http://127.0.0.1:17688/`. Port `5173` is development-only and is available only while `pnpm dev` is running. For explicit private-LAN HTTP access, use `examples/palmtty.lan.example.yaml` or set `server.exposure.mode: lan`; the Agent then binds IPv4 `0.0.0.0`, requires authentication, rejects non-private client source addresses, and accepts only exact detected private/overlay IPv4 Origins. Windows Firewall should still scope the Agent port to the trusted Private network profile. PalmTTY stores the workspace catalog in per-user application data. The browser can create/edit/delete this persistent catalog only through authenticated, exact-Origin-protected API calls; starting a Session still sends only the selected workspace ID.

### Runtime choices

- The normal editor flow uses a single **Terminal environment** selector. Known Host shells appear directly, and each registered WSL distribution appears as its own profile (for example `Ubuntu-22.04` or `Debian`). Host/WSL runtime details are exposed only under **Custom**.
- WSL profile discovery uses `wsl.exe --list --quiet`; it does not start distributions merely to populate the selector. A selected WSL profile uses that distribution's default shell unless Custom overrides it, and its working directory remains a Linux path.
- Workspace creation/update validates the directory/runtime/shell before persistence. Session creation and explicit terminal restart validate again before Worker bootstrap.
- Workspace environment uses one `NAME=value` entry per line and is applied before the shell starts. Balanced outer single/double quotes are accepted and removed, so both `HTTP_PROXY=http://127.0.0.1:10808` and `HTTP_PROXY="http://127.0.0.1:10808"` persist the same URL; unmatched outer quotes are rejected. On Windows, each new/restarted terminal also refreshes the current Machine/User environment and PATH, so CLIs installed after the PalmTTY Agent started can be discovered by a new PTY. WSL workspace variables are forwarded through `WSLENV`.
- Shell arguments remain explicit argv values. Startup command is optional multiline terminal input sent after the shell starts. Workspace environment is persistent local configuration, not a secret vault.

If Windows reports `EACCES/WSAEACCES` while probing the Agent port, distinguish an existing listener from a reserved/excluded port:

~~~powershell
Get-NetTCPConnection -LocalPort 17688 -ErrorAction SilentlyContinue
netsh interface ipv4 show excludedportrange protocol=tcp
~~~

If the configured port is unavailable, change `server.port` in `palmtty.local.yaml` and rerun `pnpm run preflight`.

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

## 中文

### 环境要求

- Node.js 22 或更高版本。
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
- Shell 参数继续按独立 argv 传递；启动命令支持多行，在 Shell 启动后发送。Workspace environment 是本机持久化配置，不是密钥保险箱。

如果 Windows 在探测 Agent 端口时报告 `EACCES/WSAEACCES`，先区分普通监听进程与 Windows 排除/保留端口：

~~~powershell
Get-NetTCPConnection -LocalPort 17688 -ErrorAction SilentlyContinue
netsh interface ipv4 show excludedportrange protocol=tcp
~~~

如果配置端口不可用，请修改 `palmtty.local.yaml` 中的 `server.port`，重新执行 `pnpm run preflight`。

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
