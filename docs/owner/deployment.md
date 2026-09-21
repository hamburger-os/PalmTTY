# 部署架构

## 本机开发

`pnpm dev` 的默认开发拓扑现在是：

```text
本机浏览器 / 同一私有局域网手机
        │ http://<开发机-LAN-IP>:5173
        ▼
Vite dev server（默认 0.0.0.0:5173）
        │ 本机代理 /api + WebSocket
        ▼
PalmTTY Agent（仍使用配置中的 host/port；示例配置保持 127.0.0.1:17688）
```

根开发启动器会枚举当前机器的 RFC1918、IPv4 link-local 和 100.64/10 私有/overlay 地址，把对应的 `http://<address>:5173` **精确 Origin** 只在本次 development Agent 进程内追加到 allowlist；不会写回配置文件，也不会把 Origin 放宽成通配符。默认仍要求 access token。设置 `PALMTTY_WEB_HOST=127.0.0.1` 可以显式退回仅本机 Vite 监听。

Windows 如果另一台局域网设备访问 5173 超时，应允许 Node.js/PalmTTY 的 TCP 5173 通过 **Private** 网络防火墙；PalmTTY 不会自动提权修改防火墙。Agent 启动后再通过 Web UI 管理 Workspace；Workspace 不写入 `palmtty.local.yaml`，而是保存到当前用户应用数据目录。

## 家庭局域网 / QNAP

推荐拓扑：

```text
手机
  │ HTTPS/WSS
  ▼
域名
  │
QNAP / Caddy
  │ 内网 HTTP
  ▼
Windows 11 :7688
  │
PalmTTY Agent
```

PalmTTY 配置使用：

- 非 loopback 监听地址；
- `auth.enabled: true`；
- `secureCookies: true`；
- `trustedOrigins` 只填写最终 HTTPS 域名；
- token 从 Windows 环境变量提供。

参考配置：`examples/qnap-reverse-proxy.yaml`。

## 更推荐的私有网络

如果不需要“任何浏览器直接公网访问”，优先选择 Tailscale/WireGuard，让 PalmTTY 只在私有网络可达。

## QNAP 的角色

QNAP 只承担入口能力：

- TLS；
- 域名；
- WebSocket 反代；
- 可选的额外认证。

真正的 Shell、Codex、Git 和项目文件都留在 Windows 开发电脑。

## 当前不做

- PalmTTY 官方云中继；
- NAT 穿透服务；
- 自动申请公网域名；
- 在 QNAP 上运行用户的开发 Shell。
