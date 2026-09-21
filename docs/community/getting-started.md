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

Open the configured Agent URL, sign in, and create the first workspace in the Web UI. PalmTTY stores the workspace catalog in per-user application data. The browser can create/edit/delete this persistent catalog only through authenticated, exact-Origin-protected API calls; starting a Session still sends only the selected workspace ID.

### Runtime choices

- **Host**: launches a shell directly on the Agent OS. The editor detects installed shell profiles; on Windows PowerShell 7 is preferred when available, with Windows PowerShell/Command Prompt or Custom as explicit alternatives.
- **WSL**: available from a Windows Agent when `wsl.exe` is usable. The editor can detect shells inside the selected distribution; workspace directory paths remain Linux paths.
- Workspace creation/update validates the directory/runtime/shell before persistence. Session creation and explicit terminal restart validate again before Worker bootstrap.
- Workspace environment uses one `NAME=value` entry per line and is applied before the shell starts. On Windows, each new/restarted terminal also refreshes the current Machine/User environment and PATH, so CLIs installed after the PalmTTY Agent started can be discovered by a new PTY. WSL workspace variables are forwarded through `WSLENV`.
- Shell arguments remain explicit argv values. Startup command is optional multiline terminal input sent after the shell starts. Workspace environment is persistent local configuration, not a secret vault.

If Windows reports `EACCES/WSAEACCES` while probing the Agent port, distinguish an existing listener from a reserved/excluded port:

~~~powershell
Get-NetTCPConnection -LocalPort 7688 -ErrorAction SilentlyContinue
netsh interface ipv4 show excludedportrange protocol=tcp
~~~

If the configured port is unavailable, change `server.port` in `palmtty.local.yaml` and rerun `pnpm run preflight`.

### Development mode

~~~powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
~~~

`pnpm dev` runs the same Agent preflight before starting the Agent and Vite. The root launcher derives the local Agent URL from the validated config and injects it as `PALMTTY_AGENT_URL`; Vite uses strict port 5173. Add `http://127.0.0.1:5173` to `trustedOrigins` while using development mode.

For phone access, do **not** expose the development configuration directly to the Internet. Use a private network or the authenticated HTTPS reverse-proxy configuration described in [security.md](security.md).

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

打开配置的 Agent 地址并登录，然后直接在 Web UI 中创建第一个工作区。PalmTTY 会把工作区目录持久化到当前用户的应用数据目录。浏览器只能通过已认证且受精确 Origin 保护的 API 持久化创建/编辑/删除工作区；真正创建 Session 时仍只发送 workspace ID。

### 运行环境

- **宿主机（Host）**：直接在 Agent 所在 OS 启动 Shell。编辑器会自动检测已安装 Shell；Windows 优先推荐 PowerShell 7，也可以直接选择 Windows PowerShell、命令提示符或“自定义”。
- **WSL**：Windows Agent 检测到可用 `wsl.exe` 时可选；编辑器可以检测所选发行版内部已安装的 Shell，工作目录仍使用 Linux 路径。
- 新建/修改工作区时会验证目录、运行环境和 Shell；创建 Session 与显式“重启终端”前还会再次验证。
- 工作区环境变量使用每行一个 `NAME=value`，在 Shell 启动前应用。Windows 每次新建/重启终端还会重新读取当前 Machine/User 环境与 PATH，因此 Agent 启动后新安装到用户 PATH 的 CLI 可被新 PTY 看见；WSL 通过 `WSLENV` 转发配置变量。
- Shell 参数继续按独立 argv 传递；启动命令支持多行，在 Shell 启动后发送。Workspace environment 是本机持久化配置，不是密钥保险箱。

如果 Windows 在探测 Agent 端口时报告 `EACCES/WSAEACCES`，先区分普通监听进程与 Windows 排除/保留端口：

~~~powershell
Get-NetTCPConnection -LocalPort 7688 -ErrorAction SilentlyContinue
netsh interface ipv4 show excludedportrange protocol=tcp
~~~

如果配置端口不可用，请修改 `palmtty.local.yaml` 中的 `server.port`，重新执行 `pnpm run preflight`。

### 开发模式

~~~powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
~~~

`pnpm dev` 会先执行同一套 Agent preflight，再启动 Agent 与 Vite。根启动器从已验证配置推导本地 Agent URL，并通过 `PALMTTY_AGENT_URL` 注入 Vite；Vite 固定使用 5173 且开启 strict port。开发模式下需要把 `http://127.0.0.1:5173` 加入 `trustedOrigins`。

手机访问时不要把开发配置直接暴露到公网。应使用私有网络，或采用 [security.md](security.md) 中描述的 HTTPS 认证反向代理方案。
