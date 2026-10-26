<!-- bilingual -->
# Independent Web applications / 独立 Web 应用

## English

Optional `managed` entries own loopback listeners and explicit default-off autoStart. `external` entries contain only mode/url and never launch locally; absent entries are hidden. Official Code must be installed separately and its terms reviewed; PalmTTY neither accepts licenses nor disables upstream tokens. Harness uses a verified pinned private installation. Owned app/installer leases reclaim descendants without killing durable Terminal Workers.

The workbench has four panes: Terminal/Git/Files/Artifacts. Code is a separate new-page action after the tabs and opens the persisted host workspace folder; WSL paths are not guessed. Home Code/Harness cards provide independent links. No third-party iframe or frame cache remains.

A click can explicitly authorize an owned managed instance through an authenticated exact-Origin rate-limited POST. Only that response carries an upstream bootstrap URL; catalogue/rendered href, logs, storage and PalmTTY cookies remain credential-free. The destination is fixed by host configuration, never a browser-supplied URL. Upstream authentication stays enabled and independent. If bootstrap authorization is rate-limited, the link still opens the clean target so existing upstream sessions remain usable; the server budget is unchanged.

For private WireGuard deployment on Windows x64, PalmTTY and Harness may use HTTP while Code retains trusted HTTPS for secure-context-dependent browser features. Use this single configuration, replacing the example private host and resolver addresses:

```yaml
server:
  port: 17688
  exposure:
    mode: lan
  privateGateway:
    listenHost: 192.168.1.10
    upstreamDns: 192.168.1.1
integrations:
  vscodeWeb:
    mode: managed
    autoStart: true
    port: 8000
    url: https://code.palmtty.home.arpa/
  harness:
    mode: managed
    autoStart: true
    port: 3080
    url: http://harness.palmtty.home.arpa:3080/
```

Open PalmTTY at `http://192.168.1.10:17688/` with its access token. Both app names must be distinct siblings under `.home.arpa`: cookies are not isolated by port. Harness HTTP is narrowly permitted for this managed LAN private gateway and must match its managed port; Code remote HTTP is not offered by this profile. Both upstream listeners remain loopback; Caddy binds the concrete private IP. An explicit all-HTTPS reverseProxy configuration is also supported.

Run `pnpm deploy:local --config <path> --env-file <path>`; Windows without arguments reuses the installed paths. It installs frozen dependencies, builds, preflights, registers user startup, checks apps and exports public setup files. Set WireGuard DNS to the host; device root trust is needed only for Code HTTPS. Existing root trust remains valid. LAN public setup is at `/network-setup/`; CA keys never leave the host. If needed, explicitly run the generated firewall helper as administrator: it restricts named rules to program/private address/private sources, TCP 17688, 443 and 3080 plus TCP/UDP 53. No silent elevation or public port forwarding.

HTTP trusts the LAN/overlay path; a VPN does not itself turn HTTP into a browser secure context. Code feature needs differ from Harness, which supports HTTP. Independently test authenticated navigation, folder selection, APIs and WebSockets on the actual devices. Small-screen upstream UI remains outside PalmTTY control.

`pnpm app:authorize vscodeWeb` / `harness` explicitly displays a private local bootstrap URL in the operator terminal when needed. `powershell -File scripts/cleanup-code-web.ps1` cleans legacy directly started Code leftovers and preserves active PalmTTY-owned ancestry.

## 中文

上述配置是唯一来源：managed 管理回环服务与自启，external 只提供外部链接，缺省禁用。官方 Code 自行安装并确认条款，不关闭认证；Harness 校验固定私有版本。Agent 启动应用，目录轮询无安装副作用；自有容器退出清理不影响持久终端 Worker。

删除全部第三方内嵌。工作区四个标签后是独立打开当前目录的 Code 动作，WSL 路径不猜测；首页 Code/Harness 卡片均有链接。点击受管链接可通过认证、精确 Origin、限流的显式接口交接引导凭据，仅用于新页面导航，不写 href、日志或存储，不共享 PalmTTY 登录。授权限流时仍可打开干净入口供上游校验已有登录，不放宽预算。

WireGuard 内网使用上述混合方案：PalmTTY 通过主机 IP HTTP 和原令牌登录，Harness 使用独立内网名称 HTTP，Code 保留已信任 HTTPS。Harness 没有 HTTPS 硬性要求；Code 的 webview 等功能依赖安全上下文。HTTP 方案信任内网传输，VPN 不改变浏览器规则。端口不隔离 Cookie，两个应用名称必须不同。私有网关仅 Windows x64 自动供应；全 HTTPS reverseProxy 也是可选显式模式。

一键部署命令完成依赖、构建、预检、自启和应用检查，Windows 无参数复用已安装路径。WireGuard DNS 仍指向主机，证书信任只供 HTTPS，已有证书无需重装。`/network-setup/` 只提供公开安装材料，私钥不导出；若防火墙阻挡，操作者明确以管理员身份运行导出的 helper，它只修改具名、程序与私有来源受限规则，不自动提权。

分别验收登录、当前目录、HTTP API、WebSocket 和 Worker 持久性；独立打开不承诺改善上游手机界面。显式本机授权与旧 Code 清理命令见上文。源码部署不需要先卸载自启。
