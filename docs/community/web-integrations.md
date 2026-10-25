<!-- bilingual -->
# Managed local Web applications / 本机 Web 应用管理

## English

VS Code and DeepSeek Harness are always shown, including their discovery/install/start/access status. Authenticated status is `GET /api/v1/integrations` (no-store). A strict-origin, authenticated `POST /api/v1/integrations/harness/ensure` performs a single-flight attempt; the Web UI requests this automatically once on login and provides retry. It never accepts client-supplied binaries, package versions, URLs or shell commands.

- **VS Code**: Discover an existing official Windows VS Code CLI. Microsoft prohibits hosting official VS Code Server as a service. PalmTTY does **not** manage its Server lifecycle or kill arbitrary VS Code/Node processes. Start the official `code serve-web` from an interactive session if allowed by your applicable license. A separate valid link can be configured.
- **Harness**: Reuse an existing managed or globally installed official DSH CLI. If unavailable, attempt a pinned `@deepseek-ai/dsh@0.2.1-rc.2` npm installation under the current user in a separate PalmTTY-managed directory. Installed Windows/Linux releases bundle npm from their official Node 24 distribution; source installations require the host to provide npm. No silent OS-level installation or administrative elevation occurs. Run `dsh web --no-open --host 127.0.0.1 --port 0` with a non-shell Node invocation; PalmTTY controls only the process it spawned. DSH still owns credentials, model choice, workspaces and sessions.
- **Diagnostics**: Installing, starting, running, missing software, npm unavailable, failed installation, process exited and remote access not configured are distinct states. No upstream stderr or token-bearing startup URL is logged.
- **Security**: Third-party UI is never proxied into the authenticated PalmTTY origin. Access from the Agent host's local browser can use the captured one-time DSH token URL; remote clients never receive it or a host-loopback link. A protected **separate** HTTPS origin is needed for your NAS/phone setup. The current version cannot automatically provision the external DNS/proxy/certificate solely from the PalmTTY YAML. The user may optionally provide externally secured URLs:

```yaml
integrations:
  vscodeWeb: "https://code.example.test/"
  harness: "https://harness.example.test/"
```

Only HTTPS or loopback HTTP is accepted, without credentials, query or fragment. The upstream Web service retains its own authentication; these fields are **access addresses**, not executables or auto-install configuration.

## 中文

VS Code Web 和 DeepSeek Harness 始终展示，不再因没有配置 URL 而隐藏。登录后通过只读受认证 API 检测安装与状态；前端自动触发一次 `POST /api/v1/integrations/harness/ensure`，并提供失败重试。服务端固定可运行的命令、版本及参数，不允许浏览器任意输入程序名或目标端口。

- **VS Code**：自动检测官方 Windows VS Code CLI。微软禁止将官方 VS Code Server 作为服务托管，因此 PalmTTY 不代替用户创建 Server 守护进程，不按未知 PID 清理其他 Code/Node 进程。官方 CLI 须在许可允许的交互式用户会话中运行。
- **Harness**：先复用现有官方 CLI；若不存在，使用主机的 npm 在当前用户隔离目录安装固定的 `@deepseek-ai/dsh@0.2.1-rc.2`，并以 Node 直接启动回环随机端口服务。Windows/Linux 安装版除 Node 24 外还自带官方 npm CLI，不要求系统另行安装 npm；源码版仍须提供 npm，不暗中提权。
- **边界**：Harness 的工作区、会话、模型、认证仍由 Harness 管理，PalmTTY 不复制。只保管当前 Agent 启动进程的临时启动地址，不在日志中打印它。
- **NAS/手机**：`127.0.0.1` 在手机上指向手机，并非 Windows 主机；现有一个 HTTPS Origin 的 NAS 代理不足以让第三方 UI 安全接入。PalmTTY 不将第三方脚本代理到已经登录的同源页面，也不向远端发送本机令牌 URL。确有独立受保护 HTTPS 入口时，可选地设置上述 URL；两款上游仍需独立认证。暂不声称自动完成额外 DNS/TLS/反代配置。

## Workspace upgrade / 工作区升级

Back up the v3 store, stop the Agent and run `pnpm --filter @palmtty/protocol build` to build the canonical schema. Then run `node scripts/migrate-workspaces-v4.mjs --from <v3-path> --to <v4-path>`. It atomically publishes fully written output via an exclusive same-directory hard link (requires hard-link support), never overwrites existing output, does not delete the source, and omits removed Remote App profiles. The runtime reads only v4.

升级前关闭 Agent 并备份，先构建 `@palmtty/protocol`，再离线运行转换工具，保留原 V3，不覆盖已有 V4；新运行时只读取 V4。


**Upstream token scope / 上游令牌作用域：** PalmTTY itself never puts its login or Worker secrets in URLs. DSH requires an upstream one-time process-token URL to exchange for its own browser cookie; this is exposed only on authenticated same-host `local` access and is neither persisted/logged nor returned to LAN/NAS clients. PalmTTY login and DSH login remain separate. / PalmTTY 的登录、Worker 密钥绝不使用 URL；只有 DSH 官方首次授权采用的一次性令牌 URL 在受认证本机 `local` 模式下开放，远端不提供，也不记录日志和持久化。


### Bundled npm / 安装版自带 npm

Windows/Linux installed releases include the official npm CLI from their pinned Node.js 24 distribution, with its `LICENSE`, dependency SBOM and version verified by installed-runtime smoke. No global npm is required for a packaged Agent to attempt a fixed-version DSH install. Source checkouts still need npm. Registry network access and an independent secure HTTPS Origin for phone access remain separate requirements.

Windows/Linux 安装包已包含与捆绑 Node 24 一致的官方 npm CLI，保留其许可证并在 SBOM 和安装态 smoke 中验证。安装版无需系统另装 npm；源码版仍需 npm。下载固定 DSH 版本仍须联网，手机独立安全 HTTPS 访问仍须单独部署。
