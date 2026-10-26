<!-- bilingual -->
# Independent Web applications / 独立 Web 应用

## English

Code/Harness open in independent pages; no application embedding. Code follows the four workspace tool tabs as a separate action and opens the persisted host folder; WSL mappings are not guessed. Both home cards provide clean links and explicit authenticated exact-Origin authorization handoff. Exhausted bootstrap budgets fall back to clean navigation without weakening limits. Upstream authentication stays enabled.

Managed entries own loopback ports and default-off autoStart. They have no URL field: the config package derives their access targets from the single private gateway address/ports. External entries contain only mode/url and never install or launch locally. Official Code must be separately installed and applicable terms reviewed; no silent license acceptance/token bypass. Harness uses verified pinned private installation. Installation is bounded to 10 minutes; Code startup to 75 seconds and Harness profile startup to 180 seconds, accommodating observed cold-start latency without weakening readiness/authentication. Owned app/installer/proxy leases preserve independent durable Terminal Workers.

```yaml
server:
  port: 17688
  exposure:
    mode: lan
  privateGateway:
    listenHost: 192.168.1.10
    httpsPort: 443
integrations:
  vscodeWeb:
    mode: managed
    autoStart: true
    port: 8000
  harness:
    mode: managed
    autoStart: true
    port: 3080
```

Windows x64 provisions only hash-verified Caddy. Both Wi-Fi and WireGuard use the same entries: PalmTTY `http://192.168.1.10:17688/`, Code `https://192.168.1.10/`, Harness `http://192.168.1.10:3080/`. No CoreDNS, private hostname, hosts file, port 53 or upstreamDns exists. Either application can be enabled alone; Harness-only does not require a CA. Backends remain loopback, proxy listeners bind the concrete private IP and reject public sources. Keep the host IP fixed.

Code uses an IP-SAN leaf under the persistent private CA; existing device root trust remains valid. Only HTTPS needs certificate trust. HTTP trusts the LAN/overlay path. Same-IP ports remain one trusted cookie host, not tenant isolation. The gateway strips the PalmTTY session cookie from upstream HTTP/WS while preserving application cookies and authentication. Do not use this model for mutually untrusted apps.

Run `pnpm deploy:local --config <path> --env-file <path>`; Windows without arguments reuses installed paths. It builds, preflights, updates current-user autoStart and checks readiness without retiring Workers. Before retiring old DNS, restore WireGuard DNS to a normal resolver reachable through the tunnel. Back up configuration and preserve CA/workspaces/token. The generated explicit administrator firewall helper updates only named private-source/program/address HTTP/HTTPS rules and removes retired DNS rules; no automatic elevation. Public setup is `/network-setup/`; no CA keys are exported.

Test both real device paths: home Wi-Fi with WireGuard off, and 5G with WireGuard on. Verify IP certificate identity, actual Code webview/folder, authenticated pages/APIs/WebSockets, wrong-Origin rejection, cookies/login/logout and original Session survival. Host smoke and viewport simulation are separate evidence.

`pnpm app:authorize vscodeWeb` / `harness` explicitly displays a private sign-in URL only in an operator terminal. `powershell -File scripts/cleanup-code-web.ps1` cleans old directly started Code leftovers while preserving active PalmTTY ownership.

## 中文

应用独立打开，自启和自身鉴权保留，不再内嵌。工作区四标签后 Code 打开持久化主机目录，WSL 路径不猜测；首页两卡片提供入口。授权显式、认证、精确 Origin、限流，达到预算仍可访问干净入口。

上述配置为唯一来源：managed 只有回环端口与自启，不再保存 URL；地址由一个私有网关 IP/端口派生。external 仅保存 URL、不安装启动。官方 Code 另行安装确认条款，Harness 固定私有安装，安装 10 分钟、Code 启动 75 秒、Harness profile 冷启动 180 秒均有界；自有容器清理不影响持久终端 Worker。

Wi-Fi 和 WireGuard 使用同一 IP：PalmTTY/Harness HTTP、Code HTTPS。仅供应 Caddy，无私有 DNS、设备名或 hosts 配置。两个应用可独立启用，只用 Harness 不需要证书。主机 IP 应固定，后端保留回环。相同 IP 不同端口不隔离 Cookie，明确视为一个可信开发主机；网关剔除上游 PalmTTY 会话 Cookie，保留应用 Cookie 与认证。

Code IP 证书沿用原 CA 自动续签，已有信任无需重装；HTTP 不需要证书。切换前恢复 WireGuard 的正常 DNS，再停止旧 DNS，保留配置备份、CA、令牌和工作区。上述一键部署更新普通用户自启，不必先卸载；防火墙由操作者明确运行生成的管理员 helper，仅修改具名受限规则、移除退休 DNS 规则，不自动提权。

验收必须覆盖实际手机“Wi-Fi＋关闭隧道”和“5G＋开启隧道”，检查 Code 目录/webview、IP 证书、鉴权、Cookie、API/WS 和旧 Session 存活；主机测试不能代替真机。公开证书配置页与本机授权/旧 Code 清理命令见上文。
