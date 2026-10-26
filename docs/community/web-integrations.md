<!-- bilingual -->
# Independent Web applications / 独立 Web 应用

## English

Use explicit integration objects; old URL strings and the separate joint launcher are removed:

```yaml
integrations:
  vscodeWeb:
    mode: managed
    autoStart: false
    port: 8000
    url: https://code.example.test/
  harness:
    mode: managed
    autoStart: true
    port: 3080
    url: https://harness.example.test/
```

Managed autoStart defaults off. `external` accepts only `mode` and `url` and never launches locally; absent entries are disabled. Ports and public Origins must be distinct. Official Code is separately installed; personal opt-in launch neither accepts terms automatically nor disables authentication. Review Microsoft's current terms; tunnel service support is separate from arbitrary Server hosting. No Azure tunnel is introduced. Harness uses one verified pinned private npm installation.

Agent startup owns deployment, not browser login. Owned application/installer leases reclaim descendants using Windows non-breakaway Jobs or POSIX workload groups without retiring durable Terminal Workers. No unknown process is adopted.

Code follows Artifacts in the workspace tabs and opens its persisted host folder. WSL mappings are not guessed. Harness opens from its home card. Independent HTTPS frames mount lazily and remain mounted while hidden. First sign-in opens separately; return and reload the view. Only explicit authenticated exact-Origin POST authorization may hand an owned process bootstrap URL to its configured HTTPS root. Tokens never enter catalogue/iframe URLs, storage, logs or PalmTTY cookies. Remote loopback links are withheld. Upstream authentication remains separate; same-site HTTPS subdomains still require exact-version browser/API/WebSocket acceptance.

Run `pnpm deploy:local --config <path> --env-file <path>` from source. Windows without arguments reuses the installed paths. The command installs frozen dependencies, builds, preflights, registers user startup and checks autoStart apps. Public DNS/TLS/NAS setup remains external; the optional private gateway provisions local HTTPS/DNS as described below. See `examples/web-apps.Caddyfile` for separate host-side proxies; never proxy third-party HTML under PalmTTY or log bootstrap queries. Legacy direct Windows Code leftovers can be explicitly cleaned with `powershell -File scripts/cleanup-code-web.ps1`.

## 中文

上述对象配置是唯一来源：`managed` 管理固定本机回环监听与显式自启，`external` 只记录独立入口，缺省禁用。删除旧字符串与联合脚本，不提供兼容分支。

官方 Code 自行安装并确认适用条款，个人启动默认关闭，不自动接受许可或关闭认证；Harness 使用校验后的固定私有安装。受管应用随 Agent 启动，不依赖打开首页；独立容器负责退出回收，Terminal Worker 保留持久语义。

同主域不同 HTTPS 子域在页内嵌入，首次授权独立打开、返回刷新。目录/iframe 不带令牌；显式认证授权动作仅交接自有实例到配置的独立 HTTPS 根，不共享 PalmTTY 登录。上游 Cookie、frame 限制、HTTP/WebSocket 和手机行为必须分别验收。

`pnpm deploy:local` 完成本机依赖安装、构建、预检、自启和就绪检查；Windows 无参数复用配置/密钥文件路径。首次单独设置 DNS/TLS/NAS，参考上述代理示例，禁止同源反代与查询凭据日志。旧直接 Code 残留可显式运行上述清理脚本。


**Local first sign-in:** `pnpm app:authorize vscodeWeb` or `pnpm app:authorize harness` explicitly displays a private bootstrap URL in an interactive operator terminal (Windows reuses installed config/env-file paths). Open it locally, then use the clean root URL. Service restarts may require fresh upstream authorization. The legacy cleanup script preserves live PalmTTY-managed Code process ancestry.

**本机首次授权：** 明确执行上述命令，在操作者交互终端获取私有引导链接，本机浏览器打开后使用干净根 URL。服务重启可能需要再次授权；旧残留清理脚本会保留活跃 PalmTTY 管理的 Code 父链。

## Private WireGuard HTTPS / WireGuard 私有 HTTPS

On Windows x64, add the following server settings to the same host configuration and set both integrations to managed with their corresponding URLs. Names must be distinct siblings under one `.home.arpa` parent; they are derived from these URLs. Use the host's actual private IP and existing private DNS resolver.

```yaml
server:
  port: 17688
  exposure:
    mode: reverseProxy
    listenHost: 127.0.0.1
    origins: [https://palm.palmtty.home.arpa]
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
    url: https://harness.palmtty.home.arpa/
```

`pnpm deploy:local` verifies pinned official Caddy/CoreDNS archives and supervises them through Agent-owned leases. Unknown listeners are never killed. Deployment exports the public root certificate, an iOS certificate profile and client instructions in the current-user PalmTTY private-network directory. Set WireGuard client DNS to the host IP, trust that root on each client, and permit private-source inbound TCP 443 / TCP+UDP 53 if required. No public port forwarding is needed. System trust and firewall changes are explicit operator actions; no silent elevation. CA private keys are never exported. Restart preserves the CA but upstream applications may require authorization again.

Windows x64 可使用上述配置，替换实际主机 IP 和既有 DNS 地址。三个 HTTPS 主机名是唯一名称来源，不需要购买域名或公网端口。部署供应哈希校验后的固定工具、注册用户自启，并导出公开根证书、iOS 描述文件和连接说明。WireGuard 客户端 DNS 指向主机，每台设备首次信任证书；iOS 还需在证书信任设置启用完全信任。若入站被防火墙阻止，由操作者明确放行指定私有地址和端口；脚本不提权。父页和应用都必须 HTTPS，VPN 本身不改变浏览器安全上下文。不同端口不能隔离 Cookie，因此不能用同一 IP 的三个端口替代三个独立主机名。首次授权、iframe、Code webview、API/WS 仍应在实际访问设备验收。

Private gateway bootstrap / 私有网关首次配置：the old private IP HTTP address serves only the public CA certificate/profile and setup page, never login/API/workspace content. 旧私有 IP HTTP 地址仅提供公开证书、描述文件和首次配置页，不提供登录、API 或工作区内容；认证工作台只经 HTTPS 访问。
