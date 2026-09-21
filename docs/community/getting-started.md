<!-- bilingual -->
# Getting started / 开始使用

## English

### Requirements

- Windows 11 is the primary host target.
- Node.js 22 or newer.
- pnpm through Corepack.
- PowerShell 7 available as `pwsh`, including the normal Microsoft Store/MSIX App Execution Alias, or an explicit `shellPath` in the workspace.
- A workspace `cwd` directory that the current Windows user can access. `cwd` is not the shell executable path.

### Build

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm run preflight
pnpm check
pnpm start
```

`PALMTTY_ACCESS_TOKEN` must contain at least 16 characters; use a long random secret for real deployments. `pnpm run preflight` validates the auth environment, security exposure, the configured Agent TCP listen endpoint, workspace directories, and shell executables, reporting all detected host-configuration failures in one run. On Windows, PalmTTY recognizes the current user's Windows App Execution Alias for Store/MSIX-installed PowerShell 7 and preserves that absolute activation path for Worker creation. Use `pnpm run preflight`, not `pnpm doctor`: pnpm 10 already uses `doctor` for its own package-manager diagnostics.

If Windows reports `EACCES/WSAEACCES` while probing the Agent port, first distinguish a listener from a reserved/excluded port:

~~~powershell
Get-NetTCPConnection -LocalPort 7688 -ErrorAction SilentlyContinue
netsh interface ipv4 show excludedportrange protocol=tcp
~~~

If the configured port is unavailable, choose another `server.port` in `palmtty.local.yaml` and rerun `pnpm run preflight`. Development-mode Vite will follow the changed Agent port automatically.

Then open the configured local Agent URL on the same machine.

For phone access, do **not** expose the development configuration directly to the Internet. Use a private network or the authenticated HTTPS reverse-proxy configuration described in [security.md](security.md).

### Development mode

```powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
```

`pnpm dev` runs the same preflight before it starts either development server. An invalid token, unavailable Agent listen endpoint, workspace, or shell therefore fails once instead of leaving Vite running against an unavailable Agent. The root `pnpm dev` launcher reads the same `PALMTTY_CONFIG`, derives the local Agent URL from the configured host/port, and injects it into Vite as `PALMTTY_AGENT_URL`; an explicitly supplied `PALMTTY_AGENT_URL` can still override that target. Vite uses strict port 5173. Add `http://127.0.0.1:5173` to `trustedOrigins` while using this mode.

## 中文

### 环境要求

- 首要宿主平台为 Windows 11。
- Node.js 22 或更高版本。
- 通过 Corepack 使用 pnpm。
- 已安装 PowerShell 7，并可通过 `pwsh` 启动；Microsoft Store/MSIX 安装产生的标准 Windows App Execution Alias 也受支持；也可以在 workspace 中显式配置 `shellPath`。
- 当前 Windows 用户可以访问的 workspace `cwd` 目录。`cwd` 必须是目录，不是 `pwsh.exe` 等 Shell 可执行文件路径。

### 构建运行

```powershell
corepack enable
pnpm install
Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm run preflight
pnpm check
pnpm start
```

`PALMTTY_ACCESS_TOKEN` 至少需要 16 个字符，实际部署应使用长随机 secret。`pnpm run preflight` 会在启动前检查认证环境、安全暴露规则、Agent 配置的 TCP 监听端点、workspace 目录和 Shell 可执行文件，并在一次执行中汇总所有发现的宿主配置错误；Windows 上会识别当前用户的 Windows App Execution Alias，并把 Store/MSIX PowerShell 7 的绝对激活路径交给 Worker。请使用 `pnpm run preflight`，不要使用 `pnpm doctor`：pnpm 10 已经把 `doctor` 用作包管理器自身的诊断命令。

如果 Windows 在探测 Agent 端口时报告 `EACCES/WSAEACCES`，先区分普通监听进程与 Windows 排除/保留端口：

~~~powershell
Get-NetTCPConnection -LocalPort 7688 -ErrorAction SilentlyContinue
netsh interface ipv4 show excludedportrange protocol=tcp
~~~

如果配置端口不可用，请修改 `palmtty.local.yaml` 中的 `server.port`，重新执行 `pnpm run preflight`。开发模式下 Vite 会自动跟随新的 Agent 端口。

之后在本机打开配置的 Agent 本地地址。

手机访问时，不要把开发配置直接暴露到公网。应使用私有网络，或采用 [security.md](security.md) 中描述的 HTTPS 认证反向代理方案。

### 开发模式

```powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
```

`pnpm dev` 会先执行同一套 preflight，再启动 Agent 和 Vite；token、Agent 监听端点不可用、workspace 或 Shell 配置错误都会直接失败，不会留下一个持续代理到失效 Agent 的 Vite 进程。根 `pnpm dev` 启动器会读取同一个 `PALMTTY_CONFIG`，按 `server.host`/`server.port` 推导本地 Agent URL，再通过 `PALMTTY_AGENT_URL` 注入 Vite；用户显式设置的 `PALMTTY_AGENT_URL` 仍可覆盖该目标。Vite 固定使用 5173 且开启 strict port，不会静默切换到未加入 `trustedOrigins` 的其他端口。
