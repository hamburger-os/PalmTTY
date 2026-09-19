<!-- bilingual -->
# Getting started / 开始使用

## English

### Requirements

- Windows 11 is the primary host target.
- Node.js 22 or newer.
- pnpm through Corepack.
- PowerShell 7 available as `pwsh`.
- A workspace directory that the current Windows user can access.

### Build

```powershell
corepack enable
pnpm install
Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm check
pnpm start
```

Then open `http://127.0.0.1:7688` on the same machine.

For phone access, do **not** expose the development configuration directly to the Internet. Use a private network or the authenticated HTTPS reverse-proxy configuration described in [security.md](security.md).

### Development mode

```powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
```

The Vite development server runs on port 5173 and proxies `/api` to the Agent on port 7688. Add `http://127.0.0.1:5173` to `trustedOrigins` while using this mode.

## 中文

### 环境要求

- 首要宿主平台为 Windows 11。
- Node.js 22 或更高版本。
- 通过 Corepack 使用 pnpm。
- 已安装 PowerShell 7，并可通过 `pwsh` 启动。
- 当前 Windows 用户可以访问的工作目录。

### 构建运行

```powershell
corepack enable
pnpm install
Copy-Item examples/palmtty.example.yaml palmtty.local.yaml
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm check
pnpm start
```

之后在本机打开 `http://127.0.0.1:7688`。

手机访问时，不要把开发配置直接暴露到公网。应使用私有网络，或采用 [security.md](security.md) 中描述的 HTTPS 认证反向代理方案。

### 开发模式

```powershell
$env:PALMTTY_CONFIG = "$PWD\palmtty.local.yaml"
$env:PALMTTY_ACCESS_TOKEN = "replace-with-a-long-random-secret"
pnpm dev
```

Vite 开发服务器默认运行在 5173 端口，并把 `/api` 代理到 7688 端口的 Agent。使用开发模式时，需要把 `http://127.0.0.1:5173` 加入 `trustedOrigins`。
