<!-- bilingual -->
# External Web tools / 外部 Web 工具

## English
PalmTTY can expose two optional external, self-hosted application links. It does not proxy, install, supervise or authenticate these applications.

```yaml
integrations:
  vscodeWeb: "https://code.example.test/"
  harness: "https://harness.example.test/"
```

URLs must be HTTPS, except loopback HTTP for host-local testing. Passwords, usernames, queries, fragments and bearer-token links are rejected. Keep upstream authentication enabled.

**VS Code Web**: Start the official Windows `code serve-web --host 127.0.0.1 --port 8000` separately. Each PalmTTY Workspace exposes the same host-level link; select the directory inside VS Code. Codex CLI stays an ordinary Terminal startup command. Codex VS Code extension compatibility has not been qualified.

**Harness**: The independent home link opens DeepSeek Harness Web. DSH owns workspaces, sessions, credentials and model settings.

A phone cannot reach the Windows host through its own `127.0.0.1`. Secure remote HTTPS/private connectivity must be separately supplied by the operator. This change does not introduce Azure Tunnel, reverse proxy, VPN, SSO, or third-party process lifecycle management. On Windows Ctrl+C may leave `serve-web` child processes; do not indiscriminately kill all Code/Node tasks.

## 中文
PalmTTY 仅提供两个可选的自托管外部应用链接，不代理、不安装、不管理第三方进程及其身份认证。

```yaml
integrations:
  vscodeWeb: "https://code.example.test/"
  harness: "https://harness.example.test/"
```

仅允许 HTTPS 或主机回环 HTTP，禁止账号密码、查询参数和含令牌的 URL。保持第三方原生认证。

**VS Code Web**：在 Windows 上独立启动官方 `code serve-web --host 127.0.0.1 --port 8000`。每个 PalmTTY 工作区显示同一个主机级入口，进入 VS Code 后自己选择项目目录。Codex CLI 仍是 Terminal 启动命令，Codex 扩展兼容性尚未完成实测。

**Harness**：独立首页入口，直接进入官方 DSH Web，由 DSH 自行管理其工作区、会话、模型和登录。

手机上的 `127.0.0.1` 不指向 Windows。手机远程访问需要另行配置可信 HTTPS/私有网络，本轮不实现 Azure Tunnel、反代/VPN、单点登录或第三方程序进程管理。Windows 中 Ctrl+C 退出 serve-web 可能留有子进程，不可盲目结束所有 VS Code/Node 进程。

## Workspace upgrade / 工作区升级

Back up the v3 store, stop the Agent and run `pnpm --filter @palmtty/protocol build` to build the canonical schema. Then run `node scripts/migrate-workspaces-v4.mjs --from <v3-path> --to <v4-path>`. It atomically publishes fully written output via an exclusive same-directory hard link (requires hard-link support), never overwrites existing output, does not delete the source, and omits removed Remote App profiles. The runtime reads only v4.

升级前关闭 Agent 并备份，先构建 `@palmtty/protocol`，再离线运行转换工具，保留原 V3，不覆盖已有 V4；新运行时只读取 V4。
