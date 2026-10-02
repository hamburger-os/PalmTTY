# v0.3.0 Windows 原生无人值守 RDP：架构及交付门槛

状态：**Windows 原生网关方案已选定，主机只读诊断已更新；PalmTTY 登录前 Machine Service、用户会话桥接及完整浏览器桌面仍待实现。** 本文件不代表已经可以无人值守。目标：同一台 Windows 11 Pro x64，手机 Safari 中使用 PalmTTY，无 Hyper-V、Docker、WSL2 或 Windows 自动登录。

## 选型及纠偏

此前 Guacamole Linux VM 方案因目标 PC 未安装 Hyper-V 且用户明确要求原生 Windows 部署而撤回。官方 Apache Guacamole guacd Windows 构建支持仍待完成，不应将其当作可直接安装的 Windows 服务。IronRDP 提供浏览器 WASM RDP/NLA 客户端，但官方 web-client 的 RDCleanPath 扩展需要相应 Gateway，**不能假设普通 WebSocket↔TCP 透传便与官方客户端兼容**。

采用 Windows 原生 **Devolutions Gateway**（安装 MSI 后作为独立 Windows 服务运行）和经验证的同版本 IronRDP 浏览器组件。Gateway 已有独立网页应用、Custom/Argon2 用户认证、RSA provisioner 与 RDCleanPath；开发/验收先以带独立认证的本地 standalone webapp 跑通 Windows NLA，最终 PalmTTY 前端在自己 UI 中集成客户端，PalmTTY Machine Service 根据独立设备认证签发短期、绑定 **127.0.0.1:3389** 的最小权限会话授权。第三方组件的可再分发许可、精确安全补丁版本及匹配的 WASM 构建必须在发布前锁定，不能随意引用未受审查的 npm 版本或复制官网页面。

## 进程及身份边界

| 边界 | 职责 | 明确禁止 |
|---|---|---|
| PalmTTY Machine Service（待实现） | 登录前固定 HTTPS/WSS 入口、独立设备认证、服务状态、短期 RDP 授权及用户会话发现 | 以 SYSTEM 执行用户终端、记录 Windows 密码、输入到 Winlogon/锁屏/UAC |
| Devolutions Gateway（Windows 第三方服务） | 本机监听、验证签名授权、与同机 RDP 服务协商 RDCleanPath/NLA 转运 | 被客户端指定任意目的主机、作为通用 TCP 代理、向公网直接暴露无认证监听 |
| Windows TermService（系统自带） | 本机 RDP 服务、NLA 和已认证交互用户桌面 | 自动登录、无身份解锁、充当多用户 Windows Server RemoteApp |
| User Agent（现有） | 原有普通用户 Workspace、终端、Git、Files、独立 AppWorker | 机器级服务读写用户 token/recovery、跨 Windows SID 暴露工作区 |
| Safari PalmTTY（待实现） | 单页 Desktop Activity、显式 Windows 凭据、状态提示、现有 Workbench 切换 | 缓存明文密码、URL 中放持久令牌、绕过 NLA 或将全桌面图像当作 Remote App 目标 |

Machine Service 和 User Agent 通过限定消息种类且按 SID/Session ID/ACL 严格验证的本地 IPC 关联；不能只凭 PID 或请求中的用户 ID 建立授权。Machine Service 的机密与普通用户 Agent 的登录 token、runtime、Worker secret 严格分离。Machine Service 需要管理员**明确同意**安装，其 Windows 服务账户先验证 LocalService/专用虚拟服务账户可行性；不得因为实现方便而把现有 Agent 直接变成 SYSTEM 服务。

网关**只监听本机 loopback**，外网入口由经过认证的 PalmTTY Machine Service 同源反向代理和经过审查的 TLS 终止提供。Gateway standalone web UI 允许用户输入 RDP 目标，只能用于本机**可行性测试**；正式 PalmTTY 不对浏览器暴露 standalone 目标选择，而要使用有签名、限时、单次/会话绑定且目标固定为 127.0.0.1:3389 的授权，并对 WebSocket 及 HTTP 路由逐项限定。单独建立 gateway 密钥与部署 ACL，不将私钥输出给手机或放在普通用户可编辑的目录。登录前的 PalmTTY 入口也必须落实 HTTPS、精确 Origin、CSRF、速率限制、MFA 部署能力及网关进程隔离。

Windows RDP 的连接状态不改变现有 Remote App 单窗口校验：WTSDisconnected、Winlogon、安全桌面、无显示输出或 UIPI 失败时继续 fail closed，不能重放断线期间积压输入。手机切换 Desktop 和 Remote App 时只在经过认证的 RDP 仍活跃时复用会话；Safari 挂起后可能需要重新认证。无实体显示器应利用 RDP 会话自带的虚拟显示；不声称无 RDP 连接时普通控制台也有显示能力。

## 按顺序交付（关联 #90–#93）

P0 / #90：在目标 Win11 Pro 上由用户手动安装经审查的原生 Gateway，确保开机自启、仅 loopback 监听、standalone UI Custom 认证、RSA provisioner 正确保护、同机 RDP 启用 NLA。验证真实手机 Safari 认证、显示和输入；在没有显示器且没有 Windows 自动登录的冷启动状态测试，并记录实际 NLA、用户会话和 Remote App 检查结果。**未通过不得宣传无人值守。** `pnpm unattended:check -- --json` 只读校验 Windows/RDP/本地网关配置，明确不能代替此阶段的真实设备实验。

P1 / #91：实现独立登录前 Machine Service、凭据及 ACL、设备认证、限定访问和严格 IPC。安装器按明确许可注册服务并支持升级/卸载、失效恢复，服务不获取 Windows 用户令牌执行任意操作。

P2 / #92：用固定配置的签名 authorization token 接入原生 Gateway（正式环境不开放 standalone 的自由目标），经 HTTPS/WSS 限定代理 IronRDP 的协议路由和 WebAssembly 资源，把 Desktop Activity 加入 PalmTTY Workbench，先验证 Safari 中文 IME、触控、软键盘、DPI、切换及超时；客户端只持有短期令牌，不持久保存 Windows 凭据。

P3 / #93：真实无显示器冷启动、更新后重启、锁屏/RDP 断线、Safari 网络切换、原有 Terminal Worker/Remote App 协同、两个用户 SID 隔离、敌意 Origin/CSRF/URL 目标、私钥 ACL、带宽限制和 Windows/Linux CI/Distribution/CodeQL/Audit；确保安装包 SBOM、第三方 NOTICE 和版本钉住并通过 Release Action。仅此后更新根版本为 0.3.0，整理 Unreleased。

## 当前诊断与局限

`pnpm unattended:check -- --json` 在目标 Windows PC 上运行，返回 edition/build、RDP/NLA/TermService 和 **devolutionsgateway** 服务/自动启动、gateway.json 是否可读、standalone Custom 认证、provisioner 字段和本机监听是否明确配置。诊断不读取/输出私钥内容、用户凭据、真实监听 URL 或具体用户名；不会安装/启动网关、开放防火墙或修改 Windows。当前本机尚未安装 Gateway 时，blocking 将包含未安装及配置缺失，直到显式部署。即便所有字段为真，endToEndCertified 仍为 false，因为路由、签名、权限、TLS 和 iPhone RDP 实测尚未证明。

## 外部资料

- https://github.com/Devolutions/devolutions-gateway
- https://github.com/Devolutions/IronRDP
- https://github.com/Devolutions/IronRDP/tree/master/web-client
- https://issues.apache.org/jira/browse/GUACAMOLE-1841
- https://learn.microsoft.com/en-us/windows/win32/api/wtsapi32/ne-wtsapi32-wts_connectstate_class
