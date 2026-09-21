<!-- bilingual -->
# Getting started / 开始使用

## English

### Requirements

- Windows 11 is the primary host target.
- Node.js 22 or newer.
- pnpm through Corepack.
- PowerShell 7 available as `pwsh`, or an explicit `shellPath` in the workspace.
- A workspace directory that the current Windows user can access.

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

`PALMTTY_ACCESS_TOKEN` must contain at least 16 characters; use a long random secret for real deployments. `pnpm run preflight` validates the auth environment, security exposure, workspace directories, and shell executables. PalmTTY resolves shell executables to absolute paths before Worker creation. Use `pnpm run preflight`, not `pnpm doctor`: pnpm 10 already uses `doctor` for its own package-manager diagnostics.

Then open `http://127.0.0.1:7688` on the same machine.

For phone access, do **not** expose the development configuration directly to the Internet. Use a private network or the authenticated HTTPS reverse-proxy configuration described in [security.md](security.md).

### Development mode

```powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
```

`pnpm dev` runs the same preflight before it starts either development server. An invalid token, workspace, or shell therefore fails once instead of leaving Vite running against an unavailable Agent. The Vite development server runs on port 5173 and proxies `/api` to the Agent on port 7688. Add `http://127.0.0.1:5173` to `trustedOrigins` while using this mode.

## 中文

### 环境要求

- 首要宿主平台为 Windows 11。
- Node.js 22 或更高版本。
- 通过 Corepack 使用 pnpm。
- 已安装 PowerShell 7，并可通过 `pwsh` 启动；也可以在 workspace 中显式配置 `shellPath`。
- 当前 Windows 用户可以访问的工作目录。

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

`PALMTTY_ACCESS_TOKEN` 至少需要 16 个字符，实际部署应使用长随机 secret。`pnpm run preflight` 会在启动前检查认证环境、安全暴露规则、workspace 目录和 Shell 可执行文件；Shell 会先解析为绝对路径，再交给 Worker 创建 PTY。请使用 `pnpm run preflight`，不要使用 `pnpm doctor`：pnpm 10 已经把 `doctor` 用作包管理器自身的诊断命令。

之后在本机打开 `http://127.0.0.1:7688`。

手机访问时，不要把开发配置直接暴露到公网。应使用私有网络，或采用 [security.md](security.md) 中描述的 HTTPS 认证反向代理方案。

### 开发模式

```powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
```

`pnpm dev` 会先执行同一套 preflight，再启动 Agent 和 Vite；token、workspace 或 Shell 配置错误会直接失败，不会留下一个持续代理到失效 Agent 的 Vite 进程。Vite 开发服务器默认运行在 5173 端口，并把 `/api` 代理到 7688 端口的 Agent。使用开发模式时，需要把 `http://127.0.0.1:5173` 加入 `trustedOrigins`。
