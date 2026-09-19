# 部署架构

## 本机开发

默认推荐：

```text
浏览器 -> 127.0.0.1:7688 -> PalmTTY
```

此模式可以使用非 Secure Cookie，但仍建议启用 access token。

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
