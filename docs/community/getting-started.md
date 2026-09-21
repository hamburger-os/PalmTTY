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

- **Host**: launches a shell directly on the Agent OS. On Windows, an empty shell field defaults to `pwsh.exe`; on Unix-like hosts it defaults to `$SHELL` or `/bin/sh`.
- **WSL**: available from a Windows Agent when `wsl.exe` is usable. The workspace directory and optional shell are Linux paths inside the selected distribution.
- Workspace creation/update validates the directory/runtime/shell before persistence. Session creation validates again before Worker bootstrap.
- Shell arguments are explicit values, not an interpolated command string. Startup command remains optional terminal input sent after the shell starts.
- The Web workspace model intentionally does not expose arbitrary environment-variable injection.

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

- **宿主机（Host）**：直接在 Agent 所在 OS 启动 Shell。Windows 留空 Shell 时默认 `pwsh.exe`；类 Unix 宿主默认使用 `$SHELL`，否则退回 `/bin/sh`。
- **WSL**：Windows Agent 检测到可用 `wsl.exe` 时可选。工作目录和可选 Shell 都填写发行版内部的 Linux 路径。
- 新建/修改工作区时会验证目录、运行环境和 Shell；创建 Session 前还会再次验证。
- Shell 参数按独立参数传递，不拼接成命令字符串；启动命令仍是 Shell 启动后写入终端的可选输入。
- Web 工作区模型刻意不开放任意环境变量注入。

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
