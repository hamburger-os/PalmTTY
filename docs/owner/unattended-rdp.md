# v0.3.0 无人值守浏览器 RDP：架构决定与交付门槛

状态：**方案已决定；浏览器 RDP、开机机器服务及会话桥接尚未实现。** 本文不表示现有安装包支持冷启动远程登录。目标平台为 Windows 11 Pro x64，客户端为 iPhone Safari；完整桌面必须留在经过 Windows 认证的 RDP 会话中。

## 为什么不能直接扩展 Remote App

现有 AppWorker 只捕获 PalmTTY Job Object 归属的应用窗口，Windows Host 检查 WTS Active、WinSta0、Default 输入桌面及有效显示输出。视频可见不等于有权输入。断开的 RDP 会话、锁屏或 UAC 安全桌面应继续拒绝输入；不能让独立服务注入、代替 Winlogon 或假装 WTS Active。Windows Pro 不是多用户远程应用服务器，不支持把 Server RemoteApp 当作基础依赖。

## 最终边界

1. **Windows Machine Service（未来）**：经操作者显式管理员同意安装的独立、不可交互服务，负责冷启动设备入口、独立 PalmTTY 认证、最小健康状态、固定网关路由及检测 User Agent；不拥有 PTY/桌面/Winlogon，不直接读取用户工作区或凭据，不接受任意启动命令。优先评估 LocalService 及严格 ACL，只有确实需要并经过独立安全审查的特定操作才使用高权限 broker。服务和登录后的用户 Agent **绝不共用工作区文件、登录密钥、Worker recovery 根目录**。
2. **Windows User Agent（现有 Agent 演进）**：普通用户交互式登录后由现有 InteractiveToken 任务启动。保留现有 Session/AppWorker 生命周期与权威状态；独立的本地 IPC 只暴露必要的会话注册/发现/健康检查，不接受 machine 端的任意 shell/进程参数或跨用户授权。
3. **Guacamole gateway（未来）**：可选已在线 NAS/Linux，或 Windows 11 Pro Hyper-V Linux VM；单机默认需要验证 VM 在未登录情况下启动。锁定已审查的 Guacamole webapp/guacd/guacamole-common-js 版本；guacd 不暴露公网，目标 RDP 主机与端口只能是绑定的目标 Windows PC。固定、无任意 URL 的 gateway proxy 处理 HTTPS/WebSocket 和 HTTP stream，不允许被浏览器配置成通用 SSRF/隧道。
4. **PalmTTY 浏览器（未来）**：先认证 PalmTTY，然后在自己的活动界面内输入 Windows 身份凭据并建立 NLA RDP；RDP 成功以后才解锁用户 Agent 的工作区页面。可以先将经独立认证的 Guacamole UI 集成在同一站点以建立端到端链路；最终采用官方 guacamole-common-js 加受控服务器端隧道，不依赖 Guacamole 内部未公开 REST API。禁止静默转发 Windows 密码或强行声称单点登录。
5. **RDP / Remote App 协同（未来）**：用户切换到单窗口 Remote App 时，保留已认证的 RDP 交互会话；如果 Safari 后台挂起、RDP 断线、锁屏，远程应用输入立即禁止，丢弃排队控制事件，明确要求恢复认证。不能把不受控 keepalive、自动 unlock 或 tscon 桌面切换当作恢复策略。

## 信任边界及威胁

- 移动浏览器只接触同源 TLS 入口；跨站请求需要精确 Origin 和 CSRF 防御，既有 PalmTTY 认证不得被 HTTP/WSS proxy 绕过。接入公网上的入口必须有速率限制、会话失效和支持可部署的 MFA；裸露 3389 不在交付范围。
- PalmTTY 令牌与 Windows 密码分属两个独立认证域。Windows 密码仅用于一次 RDP 握手，在内存中有界停留，禁止记录/保存于 URL、日志、普通配置或浏览器持久化。Guacamole 内置的账号存储和 RDP 连接参数必须单独审计；如尚未验证交互 NLA 提示，则拒绝发布而不是禁用 NLA。
- Machine Service 只能通过按 Windows SID 和用户会话身份授权的本地 IPC 找到 User Agent。不能仅按 PID、端口或浏览器提交的 Session ID 关联；不能凭机器服务自身权限访问普通用户的 SSH/Git 凭据。
- RDP 密钥、虚拟机网卡、反向代理上游地址、Windows ACL、installer 注册/移除、升级回滚及防火墙范围都必须有可复现的测试。
- Windows 更新、VM 启动失败、RDP 未就绪、NLA 失败、网关不可达分别有错误状态；任何状态都不隐式开启权限或放宽安全配置。

## 部署和故障恢复

单机部署为 Windows 自身安装 Machine Service + Hyper-V 自启动 Linux Gateway VM（宿主机专用私有交换网络），另可外置 NAS Gateway。安装过程必须验证 Windows 11 Pro、Hyper-V 硬件支持和 RDP NLA。由操作员**显式**启用 Remote Desktop、配置 VPN/HTTPS 和限制 RDP 防火墙；脚本不得偷偷改变系统配置。

开机次序：Machine Service 提供设备登录入口；VM 与 guacd 独立启动；手机完成 PalmTTY 身份认证；用户在浏览器完成 Guacamole + Windows NLA 认证；Windows InteractiveToken 任务启动 User Agent；Machine Service 校验 SID/Session ID 后允许工作区路由；RDP 保持活跃期间 Remote App 才可输入。关闭或重启机器不保留之前的 PTY/GUI 进程，只恢复持久化 Workspace 定义。

故障必须隔离：服务故障不授权 RDP，网关故障不杀死既有 User Worker，User Agent 重启不破坏已经 adopt 的 Worker，锁屏/断开不会延迟重放输入。操作员可禁用无人值守插件并卸载服务/VM，而不删除普通用户凭据或工作区。

## 交付顺序与停止条件

- P0 可行性实验：未经物理显示器、冷启动未登录，iPhone Safari 能在集成入口完成 Guacamole 交互式 NLA 登录；测试现有 Remote App 运行在 RDP 虚拟显示中的 PrintWindow/SendInput，验证断线恢复。失败时停止，不将自动登录、禁用 NLA 或自动切桌面引入设计。
- P1 机器控制服务：独立权限边界、配置/证书/令牌存储、登录前认证、安装升级卸载、服务崩溃恢复；Windows 真实服务生命周期及 ACL 集成测试。
- P2 网关：封闭上游网络、锁定版本的 Guacamole 服务、精确代理路径、WebSocket/HTTP 流及同源认证；NLA 交互式凭据输入和拒绝未授权 RDP 目标。
- P3 浏览器/协同：单页工作区中完整 Desktop 活动，键鼠/中文 IME/分辨率、状态机、租约与重连；各个 Worker 继续各自拥有生命周期。
- P4 发布：真机冷启动、锁屏、断开、RDP 重连、升级、VM 重启、安全隔离测试 + Windows/Linux CI/Distribution/CodeQL/Audit；只有全部验收通过后，才将 root version 调到 0.3.0 并清空 Unreleased。

## 当前已交付的最小安全切片

pnpm unattended:check -- --vm <gateway-vm-name> 在**目标 Windows 11 Pro** 上只读取 OS/RDP/NLA/TermService/Hyper-V/指定 VM 状态；允许 --json。无 VM 时按外置网关方案报告。即使所有字段为真，输出仍明确要求实际 Safari/NLA、真实无显示器冷启动、权限及安全审查，绝不报告端到端已认证。该诊断尚未安装 Machine Service 或 Guacamole。

## 本方案不包含

Windows 自动登录、Winlogon 凭据代理、锁屏绕过、UAC/elevation 绕过、无身份任意远程桌面、Windows Pro 多人同时交互、重新启动旧 PTY、单窗口 Remote App 的全桌面 fallback、持久化 Windows 密码、自动开放公网 3389。
