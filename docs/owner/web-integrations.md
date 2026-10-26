# 独立 Web 应用与受管启动

## 单一配置与所有权

`integrations.vscodeWeb`、`integrations.harness` 缺省禁用；`managed` 管理固定回环端口、默认关闭的 autoStart；访问 URL 从内网网关派生，`external` 只保存 URL。状态由协议包定义，配置由 config 包定义，不维护旧字符串或联合启动脚本。

受管应用随 Agent 监听就绪后启动，网页登录与目录轮询不安装或启动程序。Code 由操作者另行安装并确认适用条款；不自动接受许可、不关闭令牌、不引入 Azure Tunnel。Harness 使用校验后的固定私有 npm 安装，先 staging 再发布，输出有界，区分安装与启动超时：安装最多 10 分钟，Code 启动 75 秒、Harness profile 冷启动最多 180 秒。主机负载下已观察到 Harness 75 秒超时而同配置随后可就绪；延长只针对其有界启动阶段，不放宽认证或就绪来源。

应用/安装器通过私有管道租约管理。Windows 使用不可 breakaway 的 kill-on-close Job，POSIX 使用工作负载进程组；Agent 正常或强停回收自有后代。持久 Terminal Worker 的生命周期独立，禁止对 Agent 进程树整体终止或凭端口/PID 接管未知程序。

## 页面入口与授权

不再内嵌第三方页面。工作区保留终端/Git/文件/附件四个视图，附件右侧的 Code 是独立打开动作，按 URL folder 参数打开当前持久化主机目录。Windows Code 不猜测 WSL 路径映射，不重启全局 Code 实例。首页 Code、Harness 卡片均提供独立链接；禁用应用不显示，无入口与安装失败分别提示。主题只管理 PalmTTY 卡片和链接。

目录与渲染 href 只含干净入口。用户点击受管应用时，同步打开独立页面，再通过认证、精确 Origin、限流的 POST 授权接口交接自有实例的上游引导 URL。响应 no-store/no-referrer，客户端不将凭据存入状态、存储、日志或目录。目标固定从主机配置派生，不能由浏览器指定；远端不返回主机回环地址。第三方保留自己的认证、Cookie、Host/Origin 和 WebSocket 权限。授权预算耗尽时仅回退到干净入口，继续由上游校验已有登录，不关闭可正常使用的页面，不放宽服务端限流。

本机显式 `pnpm app:authorize <vscodeWeb|harness>` 可在交互终端显示私有引导链接；直接本机接口与代理请求严格区分。这是明确的凭据交接，不是共享 PalmTTY 登录。

## 同一内网 IP 访问

主机 IP 固定，Wi-Fi 与 WireGuard 使用同样入口：PalmTTY HTTP + 原令牌、Code HTTPS、Harness HTTP。只有 Code 的 webview 等安全上下文功能需要可信 HTTPS；Harness 不要求 HTTPS。不再运行私有 DNS，不要求设备名或 hosts。

Windows x64 `server.privateGateway` 只含具体私有 IPv4 listenHost 和默认 443 的 httpsPort，要求 lan exposure，至少启用一个 managed 应用。managed 只保存回环 port/autoStart，Code HTTPS 与 Harness HTTP 地址由 config 包 integrationAccessUrl 统一派生，禁止重复写 url。external 继续只保存独立 URL，不触发本机启动。端口冲突明确拒绝，HTTPS 入口可显式改端口，不随机迁移。

Caddy 只代理受管应用，不代理 PalmTTY。后端均绑定 127.0.0.1，代理绑定具体内网 IP；Harness 可在不同绑定地址上使用相同端口。只启用 Harness 不要求 Code 或证书。固定官方 Caddy 归档校验哈希后供应，沿用自有进程租约；无 CoreDNS、转发器、53 监听和 upstreamDns。运行时日志删除引导查询及头部。

同 IP 不同端口仍共享 Cookie 主机范围，这是同一可信开发主机上个人应用的明确取舍，不声称等同独立主机名隔离。保留各自认证；网关按 PalmTTY 的规范 Cookie 名剔除上游请求中的会话 Cookie（含 WS Upgrade），其他应用 Cookie 原样传递。不能以此部署互不信任的多租户应用。

IP-SAN 证书使用现有私有 CA，由 Caddy 续签；设备已信任根证书则无需重装。私钥不导出；公开 `/network-setup/` 只提供根证书/描述文件/连接说明。HTTP 不需要证书，局域网传输本身仍未端到端加密。

## 切换与清理

切换前备份配置、记录运行 Session，并先将旧 WireGuard DNS 从本机恢复为隧道可达的正常解析器。客户端仍指向旧 DNS 时不能直接停服务。部署后清理已退出的自有 CoreDNS 工具和生成文件，保留原 CA、工作区和令牌。管理员 helper 只更新具名、程序/私有 IP/私有来源受限的 HTTP/HTTPS 规则，并移除退休 DNS 规则；不自动提权或修改路由器。

## 部署与验收

源码 `pnpm deploy:local [--config <path>] [--env-file <path>]` 完成冻结依赖、构建、预检、当前用户自启和应用就绪检查；Windows 无参数复用既有安装路径。升级仅可停止已注册自启实例，不杀未知监听者，失败尝试恢复原自启。旧直接启动的 Code 残留可显式运行 `scripts/cleanup-code-web.ps1`，活跃 PalmTTY 受管进程保留。

分别验收登录/错误 Origin、IP-SAN/原 CA 校验、Code folder、Harness HTTP 自身鉴权、API/WebSocket、应用正常/强停清理以及原 Worker 存活。主机检查不能替代真实手机键盘、扩展和上游小屏体验验收。必须分别记录实际手机 Wi-Fi 且关闭 WireGuard、5G 且开启 WireGuard 的验收，不能用主机模拟替代。新入口不承诺改善上游小屏界面。


操作者已确认新 IP 入口在实际手机 Wi-Fi 关闭 WireGuard、5G 开启 WireGuard 两条路径均正常；主机另行验证了 IP 证书、目录、登录/退出和 HTTP/WS。此项不代表所有扩展、webview 或输入法组合已经验收。
