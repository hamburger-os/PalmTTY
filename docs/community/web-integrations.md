<!-- bilingual -->
# Official VS Code Web and DeepSeek Harness / 官方 VS Code Web 与 Harness

## English

PalmTTY always displays **Microsoft's official VS Code Web** (`code serve-web`) and **DeepSeek Harness** on the home screen. Both are independent of PalmTTY Workspace and Terminal Sessions. Application IDs and status types are defined once in `@palmtty/protocol`. Authenticated `GET /api/v1/integrations` returns no-store status. `POST /api/v1/integrations/:id/ensure` also requires exact trusted Origin and never accepts client-supplied executables, versions, ports, URLs or shell commands.

- **Official VS Code Web**: The Agent detects the official `code` CLI from standard installation and PATH locations. It does not install or run `code serve-web` as a managed service, adopt unknown listeners or terminate official VS Code processes. Microsoft's official VS Code Server terms prohibit service hosting; start it separately in a permitted interactive user session. A configured external link is only navigation, not proof the Web server is running or authenticated.
- **Harness**: The Agent reuses a known DSH CLI or installs pinned `@deepseek-ai/dsh@0.2.1-rc.2` in current-user storage. Native Windows/Linux distributions bundle official Node 24 and npm; source mode requires npm. Installation stages to a private directory and validates package name, version and entry point before publication. Startup uses a bounded owned child on random loopback port. Failure survives polling until explicit retry; only the owned child may be stopped.
- **Security**: Upstream pages are never proxied into PalmTTY's authenticated Origin or given its cookies, Worker secrets or terminal authority. A local DSH one-time token URL is released only to an authenticated browser in the Agent host's `local` exposure mode; remote NAS/LAN clients never receive it.
- **Mobile**: Access requires independent protected HTTPS Origins and upstream authentication/proxy support. Remote DSH deployments also require upstream `--public-url` and `--trusted-host`. PalmTTY's managed local Harness launch does not automatically provision these settings.

```yaml
integrations:
  vscodeWeb: "https://code.example.test/"
  harness: "https://harness.example.test/"
```

Only HTTPS or loopback HTTP base URLs are accepted, without credentials, query or fragment. `vscodeWeb` ensure performs discovery only; Harness ensure may install/start. Official VS Code Web browser extensions (including Codex), interactive host launch, real-device mobile access, and Windows process-tree cleanup still need host acceptance.

## 中文

PalmTTY 首页固定展示**微软官方 VS Code Web（`code serve-web`）**和 DeepSeek Harness。它们与 Workspace、Terminal Session 独立，应用 ID 和状态类型统一位于 `@palmtty/protocol`。只读状态接口需登录、禁止缓存；安装/重试接口还要求精确 Origin，不接收浏览器指定的可执行程序、端口或代理目标。

- **官方 VS Code Web**：检测主机上官方 `code` CLI 的标准安装位置与 PATH；PalmTTY 不自动安装、启动或终止微软 VS Code Server。官方许可禁止托管为后台服务，需要用户在符合许可的交互式会话中独立运行。配置 URL 只是入口，不是在线检查。
- **Harness**：复用已知 CLI；缺失时用固定 npm 版本安装到当前用户目录。Windows/Linux 安装版自带 Node/npm；源码版需可用 npm。在隔离临时目录安装并验证包版本、入口后才发布；启动随机回环端口，仅管理自有进程。失败状态不被轮询覆盖，显式重试才重新准备。
- **安全**：第三方 UI 不通过 PalmTTY 已登录 Origin 反代，不共享认证信息。同机 local 浏览器可以取得 DSH 官方一次性启动 URL，LAN/NAS/手机远端浏览器绝不获取该地址或令牌。
- **远程访问**：手机需要各自受保护的独立 HTTPS Origin、上游认证和代理配置。DSH 还需配置官方 `--public-url` / `--trusted-host`；内置回环启动不会自动完成手机访问配置。

## Workspace upgrade / 工作区升级

Stop the Agent, back up V3, build `@palmtty/protocol`, then run `node scripts/migrate-workspaces-v4.mjs --from <v3-path> --to <v4-path>`. Output is validated against the canonical schema, atomically published without overwriting V4, and original V3 remains intact. / 旧 V3 只支持关闭 Agent 后备份并离线导出 V4，不保留运行时兼容。

## Distribution / 发行包

Native Windows/Linux releases include npm copied from official Node 24 with matching license, manifest/SBOM and installed-runtime smoke checks. Actual DSH Registry installation, authenticated remote HTTPS and independent VS Code Web user-session startup remain real-device acceptance requirements. / 正式发行包包含已验证可执行的 Node/npm，但上游安装、手机访问和官方 VS Code Web 仍需实机验收。
