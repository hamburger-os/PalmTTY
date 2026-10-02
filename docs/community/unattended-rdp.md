<!-- bilingual -->
# Unattended browser RDP / 浏览器无人值守 RDP

## English

**Status: design and a read-only host-readiness diagnostic; the pre-login service, gateway and browser desktop are NOT yet implemented.** The v0.3.0 goal is Windows 11 Pro, iPhone Safari and authenticated browser-based RDP. This is not Windows auto-login and is not a way to control Winlogon, the lock screen or UAC.

### Architecture under development

A future opt-in Windows Machine Service will serve a device-authenticated PalmTTY entry point before any Windows user signs in. It will coordinate (not impersonate) the normal-user PalmTTY Agent started by the existing interactive-logon task. A separately isolated Apache Guacamole/guacd gateway, hosted in an always-on Linux/NAS system or an auto-start Hyper-V Linux VM, will connect to the target Windows RDP host with NLA enabled. Browser access will use a fixed HTTPS/WSS origin. The target RDP host/port is provisioned by the operator, never supplied by the browser. Never expose port 3389 to the public Internet.

Windows credentials must be entered explicitly for Windows authentication, never copied from the PalmTTY bootstrap token or stored in plain configuration. Interactive NLA prompts must be proven with the exact pinned Guacamole versions before release. An active RDP session is not equivalent to an always-usable Remote App after the phone suspends; a disconnected Windows session remains input-blocked until a successful reconnect. No old clicks/typing are replayed.

### Available now: read-only readiness check

Run on the *target Windows PC* in a source checkout with Node/pnpm installed:

    pnpm unattended:check
    pnpm unattended:check -- --vm PalmTTY-Gateway
    pnpm unattended:check -- --vm PalmTTY-Gateway --json

The command reads the Windows edition/build, Remote Desktop and NLA registry settings, TermService state and optionally the specified Hyper-V VM's auto-start/running status. It does **not** enable RDP, change firewall rules, install Hyper-V, start a VM, create an account, log in, install Guacamole or certify the unattended setup. An operator still needs to verify a complete monitor-free cold boot using iPhone Safari, TLS, Guacamole's Windows credential prompt and a real RDP session, and confirm that Remote App remains safe after lock and disconnect. Never store real Windows credentials in the repository.

For official references see standards/unattended-rdp.md and the proposed architecture in owner/unattended-rdp.md.

## 中文

**当前状态：设计及只读主机就绪检查已加入，登录前服务、网关和浏览器桌面尚未实现。** v0.3.0 目标为 Windows 11 专业版、iPhone Safari 和经过身份认证的浏览器 RDP。不是 Windows 自动登录，也不会绕过 Winlogon、锁屏或 UAC。

### 规划中的架构

未来由操作者明确同意安装独立 Windows Machine Service，在用户登录前提供需要 PalmTTY 身份认证的设备入口；登录后由现有 InteractiveToken 任务启动普通用户 Agent，机器服务只进行最小的会话发现和协调，不冒用用户权限。独立隔离的 Apache Guacamole/guacd 网关运行在常开的 NAS/Linux 上，或者宿主机开机自动启动的 Hyper-V Linux VM 中，连接已开启 NLA 的 Windows 原生 RDP。浏览器仅通过固定 HTTPS/WSS 同源入口访问；RDP 目标与端口由管理员预配置，不能由浏览器指定，更不能把 3389 直接开放到公网。

Windows 登录凭据必须由用户显式输入，不与 PalmTTY 令牌互用，不能明文保存。特定版本 Guacamole 的交互式 NLA 提示必须经过端到端验证后才能发布。手机挂起后 RDP 可能变为断开状态，此时现有 Remote App 必须继续拒绝输入，重新认证恢复后才能操作，也不允许补发旧点击。

### 当前可用：只读就绪检查

在目标 Windows 电脑的源码目录执行：

    pnpm unattended:check
    pnpm unattended:check -- --vm PalmTTY-Gateway
    pnpm unattended:check -- --vm PalmTTY-Gateway --json

仅查询 Windows 版本、RDP/NLA 注册表、TermService、Hyper-V，以及可选的指定 VM 自启动和运行状态。不会开启 RDP、改防火墙、安装 Hyper-V、启动 VM、登录、安装网关或声称无人值守已通过验收。仍需真实测试不接显示器冷启动、iPhone Safari、TLS、Guacamole 的 Windows 凭据提示和 RDP 会话，以及锁屏与断开后的 Remote App 安全状态。仓库文档不能包含真实 Windows 凭据。
