<!-- bilingual -->
# Windows-native unattended RDP / Windows 原生无人值守 RDP

## English

**Status: architecture and read-only diagnostic implemented; the PalmTTY pre-login Machine Service and integrated Desktop UI are not yet implemented.** The target is one Windows 11 Pro x64 host and iPhone Safari, without Hyper-V, WSL2, Docker, HDMI hardware, or automatic Windows login.

### Architecture

Use the native Windows **Devolutions Gateway** service plus the compatible IronRDP WebAssembly client. Devolutions Gateway already supports browser RDP with the RDCleanPath extension. Do not replace it with a generic unreviewed WebSocket-to-TCP proxy: the official IronRDP browser client expects RDCleanPath-aware transport. The previous Apache Guacamole Linux gateway plan is no longer the selected target.

Initially, an administrator explicitly installs and configures a security-reviewed, version-pinned Windows Devolutions Gateway MSI. Set the Windows service to automatic startup, restrict **all gateway listeners to loopback**, enable the standalone web application with **Custom** password authentication (never None), and protect the provisioner private key under appropriate Windows ACLs. Configure Windows Remote Desktop with NLA enabled. The standalone web app has an unrestricted RDP destination input: use it for a private P0 experiment only, **not** as a production-facing PalmTTY desktop.

The final PalmTTY Machine Service will run before Windows user login as a separate, explicitly installed, low-privilege Windows service. It will host independently authenticated HTTPS/WSS, authorize only the fixed local RDP host (127.0.0.1:3389) with short-lived scoped Gateway tokens, and discover the ordinary user's Agent via SID/session-validated IPC. The PalmTTY UI will embed the reviewed IronRDP client as a dedicated Desktop Activity, not a second unauthenticated public RDP portal. The current window-only Remote App keeps its Job/window/desktop/input checks; it remains blocked when Windows RDP disconnects or the secure desktop is active. No Windows password persistence or auto-login is permitted.

### Available today: read-only host diagnostic

On the Windows target from this source tree, after pulling the native-gateway changes:

~~~powershell
pnpm unattended:check -- --json
~~~

The command reads only Windows edition, RDP/NLA, TermService and whether a native Devolutions Gateway service is installed, running, automatic-start, configured with Custom standalone authentication and explicit loopback listeners. It never prints credentials, key material or the gateway's addresses. Missing Gateway will appear as a blocker — the previous Hyper-V check is no longer relevant. Even a green report does not prove a real iPhone cold-boot login or secure scoped routing.

**No installer or Windows policy changes are made by this command.** Only install native Gateway after reviewing the upstream release and Windows service-account guide; do not expose Windows RDP port 3389 or a free-target standalone web UI to the Internet. The current PalmTTY per-user Agent still starts only when the user signs in.

See [owner design](../owner/unattended-rdp.md) and [upstream references](../standards/unattended-rdp.md).

## 中文

**当前只交付原生架构设计和只读诊断；PalmTTY 登录前服务与浏览器 Desktop 界面还未实现。** 目标是单台 Windows 11 专业版、iPhone Safari，无需 Hyper-V、WSL2、Docker、实体显示器或 Windows 自动登录。

### 实施路径

使用原生 Windows **Devolutions Gateway** 服务及配套的 IronRDP WebAssembly 客户端；RDCleanPath 协议扩展交由成熟 Gateway 实现，不自行编写安全敏感的 TLS/RDP 代理。原先的 Guacamole Linux VM 方案已撤回。

P0 先由管理员显式安装经过版本与安全审查的 Gateway Windows MSI，设置服务随系统自动启动、**仅本机 loopback 监听**、standalone 页面必须选择 **Custom** 独立密码认证（绝不能设成 None），并保护 provisioner 私钥 ACL；Windows 原生 RDP 继续要求 NLA。独立 standalone 页面可以输入任意 RDP 目标，**只用于本机技术验证，不能直接作为正式 PalmTTY 的公开入口**。

未来 PalmTTY Machine Service 将独立于当前用户登录、经过管理员显式同意安装，提供单独的 HTTPS/WSS 设备认证，签发目的地址固定为 127.0.0.1:3389 的短期最小权限授权，并通过 SID 与会话 ID 校验的本地 IPC 连接登录后的普通用户 Agent。PalmTTY Web 将 IronRDP 桌面嵌入为独立 Activity，与原有 Terminal、Git、Files、单窗口 Remote App 共存。Windows 断开 RDP、锁屏或处于安全桌面时继续拒绝 Remote App 输入；禁止保存 Windows 密码或进行自动登录。

### 立即可用：只读检查

拉取本轮原生方案代码后，在 Windows 目标电脑的源码目录执行：

~~~powershell
pnpm unattended:check -- --json
~~~

检查 Windows/RDP/NLA/TermService、原生 Gateway 服务及自动启动，以及只读分析 gateway.json 的认证和回环监听配置。不会输出密钥、凭据和真实监听地址，不安装软件或修改防火墙。Gateway 尚未安装会形成明确阻塞，而 **Hyper-V 未安装不再构成条件**。即使所有配置检查通过，也必须在无显示器、无人登录的冷启动机器上用 Safari 完成实际 NLA 登录、键鼠输入及断线恢复测试，才有资格宣布实现无人值守。

后续机器服务与 Desktop Activity 见[维护者设计](../owner/unattended-rdp.md)和[权威资料](../standards/unattended-rdp.md)。
