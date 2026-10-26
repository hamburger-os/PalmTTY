# 独立 Web 应用与受管启动

## 单一配置与所有权

`integrations.vscodeWeb`、`integrations.harness` 缺省禁用；`managed` 管理固定回环端口、默认关闭的 autoStart 和可选独立根 URL，`external` 只保存 URL。状态由协议包定义，配置由 config 包定义，不维护旧字符串或联合启动脚本。

受管应用随 Agent 监听就绪后启动，网页登录与目录轮询不安装或启动程序。Code 由操作者另行安装并确认适用条款；不自动接受许可、不关闭令牌、不引入 Azure Tunnel。Harness 使用校验后的固定私有 npm 安装，先 staging 再发布，输出有界，区分安装与启动超时。

应用/安装器通过私有管道租约管理。Windows 使用不可 breakaway 的 kill-on-close Job，POSIX 使用工作负载进程组；Agent 正常或强停回收自有后代。持久 Terminal Worker 的生命周期独立，禁止对 Agent 进程树整体终止或凭端口/PID 接管未知程序。

## 页面入口与授权

不再内嵌第三方页面。工作区保留终端/Git/文件/附件四个视图，附件右侧的 Code 是独立打开动作，按 URL folder 参数打开当前持久化主机目录。Windows Code 不猜测 WSL 路径映射，不重启全局 Code 实例。首页 Code、Harness 卡片均提供独立链接；禁用应用不显示，无入口与安装失败分别提示。主题只管理 PalmTTY 卡片和链接。

目录与渲染 href 只含干净入口。用户点击受管应用时，同步打开独立页面，再通过认证、精确 Origin、限流的 POST 授权接口交接自有实例的上游引导 URL。响应 no-store/no-referrer，客户端不将凭据存入状态、存储、日志或目录。目标固定来自主机配置，不能由浏览器指定；远端不返回主机回环地址。第三方保留自己的认证、Cookie、Host/Origin 和 WebSocket 权限。授权预算耗尽时仅回退到干净入口，继续由上游校验已有登录，不关闭可正常使用的页面，不放宽服务端限流。

本机显式 `pnpm app:authorize <vscodeWeb|harness>` 可在交互终端显示私有引导链接；直接本机接口与代理请求严格区分。这是明确的凭据交接，不是共享 PalmTTY 登录。

## WireGuard 私网部署

当前简化方案：PalmTTY 使用 `server.exposure.mode: lan`，通过主机 IP 的 HTTP 和原访问令牌访问；Code 使用已信任的 HTTPS；Harness 使用独立内网名称的 HTTP。WireGuard 不改变浏览器安全上下文，Code webview 的 crypto.subtle 等功能需要可信入口；Harness 本身不要求 HTTPS。HTTP 仍未端到端加密，采用该方案意味着信任局域网及隧道。

Windows x64 可启用 `server.privateGateway`，两个 managed 应用使用同一 `.home.arpa` 父域下不同名称。Code HTTPS 默认 443；Harness HTTP 的外部端口必须等于 managed 端口，代理绑定具体内网 IP、上游绑定 127.0.0.1，允许相同端口但不同地址。不同端口不能隔离 Cookie，所以不把两个应用放到同一个 IP 主机名。完整 HTTPS 的 reverseProxy 配置也是显式支持的部署模式。

Caddy/CoreDNS 从固定官方归档校验哈希后供应，由 Agent 租约管理，拒绝公共来源、限制 DNS 转发、不记录查询或引导串。CA 私钥仅留当前用户目录，首次信任仅服务 HTTPS 应用。LAN `/network-setup/` 提供公开证书、iOS 描述文件和说明。DNS 仍用于两个应用名称，已信任证书无需重装。防火墙 helper 仅更新具名、程序/私网地址/私有来源受限的规则；不自动执行管理员操作。

## 部署与验收

源码 `pnpm deploy:local [--config <path>] [--env-file <path>]` 完成冻结依赖、构建、预检、当前用户自启和应用就绪检查；Windows 无参数复用既有安装路径。升级仅可停止已注册自启实例，不杀未知监听者，失败尝试恢复原自启。旧直接启动的 Code 残留可显式运行 `scripts/cleanup-code-web.ps1`，活跃 PalmTTY 受管进程保留。

分别验收登录/错误 Origin、Code HTTPS 证书校验与 folder、Harness HTTP 自身鉴权、API/WebSocket、应用正常/强停清理以及原 Worker 存活。主机检查不能替代真实手机键盘、扩展和上游小屏体验验收。原私有 HTTPS 手机链路已由操作者确认可用；本次改为独立页面不承诺改善上游移动界面。
