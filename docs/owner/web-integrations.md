# 独立 Web 应用、受管启动与页内嵌入

## 单一配置与边界

`integrations.vscodeWeb` 和 `integrations.harness` 可缺省（禁用），或明确选择：

- `managed`：本机固定 IPv4 回环端口、默认关闭的 `autoStart` 与可选独立根 URL。显式开启后由 Agent 监听就绪时启动，网页登录/轮询不触发部署。
- `external`：仅保存独立 URL；不安装、启动或停止本机程序，不将外部入口与本机状态混用。

旧字符串直接拒绝，删除前台联合启动器，不维护兼容路径。身份/状态只定义于协议包，配置只定义于 config 包；Code/Harness 不变成 Workspace/Terminal Session 类型。

官方 Code 由操作者自行安装；个人启动由本机配置显式选择，网页不能提交命令、版本或路径。PalmTTY 不捆绑微软二进制、不自动接受许可、不关闭连接令牌。官方 tunnel service 与 Server 托管限制是不同问题，不再笼统宣称所有后台运行都被禁止，也不保证私人用法获得许可；参照 standards/vscode-web.md，不引入 Azure Tunnel。

Harness 只执行已校验固定 `@deepseek-ai/dsh@0.2.1-rc.2` 私有安装，不执行未校验全局入口。安装先 staging 后发布；输出保留有界但不因普通输出多杀掉安装器。区分安装超时与启动超时，失败保持可见、重试显式触发。

## 进程所有权

应用/安装器使用私有管道租约：Windows 在恢复执行前加入不可 breakaway 的 kill-on-close Job，POSIX 使用租约监督器与工作负载进程组。包装进程先退出也清理后代；Agent 强停导致租约断开。Terminal Worker 继续独立持久，不能对 Agent 树形全杀，也不能凭端口或持久 PID 接管未知程序。

Agent 正常 SIGINT/SIGTERM 调用 app.close；Windows Task Scheduler 强停由独立租约/Job 兜底，不能假设 Unix 信号语义。

## 页内展示与首次授权

三个同站、不同主机名的 HTTPS 入口保持独立 Origin 与 host-only Cookie；不同端口不能隔离 Cookie。浏览器直接 iframe 加载，PalmTTY 不代理第三方 HTML、不读取其 DOM。首次访问挂载，切换保留；隐藏终端不传播尺寸变化。主题只统一外框/导航/动作，内部主题由上游管理。

目录与 iframe src 只含无凭据根 URL。本机无域名阶段可显式运行 `pnpm app:authorize <vscodeWeb|harness>`，仅在交互终端显示私有首次登录地址；它从直接本机接口认证，代理请求不能冒认本机操作者，此项不进入默认日志。首次授权是单独认证 + 精确 Origin POST，仅把自有实例的上游引导 URL 交给操作者打开的独立标签页；远端目标只能是配置的独立 HTTPS 根，不能是回环或请求参数。响应 no-store/no-referrer，凭据不进入存储、日志或目录。这是明确的上游凭据交接，不是共享 PalmTTY 登录。第三方仍独立校验自己的 Cookie、Host、Origin、HTTP/WebSocket 权限。

同站子域有助于 SameSite Cookie，但上游 frame 限制、OAuth 回调、HTTP/WebSocket 与 iOS Safari 必须实测；独立打开始终保留。

## 部署与验收

源码 `pnpm deploy:local [--config <path>] [--env-file <path>]` 完成冻结依赖安装、构建、预检、当前用户自启注册和受管应用检查；Windows 无参数复用既有安装路径。发行版继续使用 bundled Node/npm 与 `palmtty service`。DNS、TLS、NAS 规则首次独立配置。

NAS 不能直接连接另一主机回环：由主机独立 HTTPS 代理接入固定回环端口，参考 `examples/web-apps.Caddyfile`；禁止同源反代或代理记录引导查询串。显式运行 `scripts/cleanup-code-web.ps1` 仅清理当前用户官方 serve-web Node 树中的旧直接启动残留。

本机就绪不等于远程设备可用。分别验收首次授权、iframe、HTTP API、WebSocket、切换不重连终端、正常/强停端口释放与独立 Worker 存活。

## 工作区入口与内网 HTTPS

删除全局三按钮导航。Code 位于工作区附件右侧，通过 URL folder 参数打开持久化主机 cwd；不重启全局 Code 服务，不把路径传给 Session 创建。Windows Code 不猜测 WSL 路径映射。终端保持 mounted，隐藏时停止几何传播；Code 仅在首次进入时挂载，保留当前工作区 iframe，不无限缓存历史工作区。Harness 从首页卡片进入，单一返回动作回到首页。已运行但缺入口时提示配置，不显示安装重试。

可选 `server.privateGateway` 仅支持 Windows x64，包含具体内网 `listenHost` 和现有私有 `upstreamDns`。它要求 reverseProxy 监听 127.0.0.1、一个 PalmTTY HTTPS Origin 和两个受管应用 HTTPS 根 URL；三个不同同级主机名位于同一 `.home.arpa` 父域，统一 443。名称仅从现有 URL 派生，不另存域名列表。

部署校验固定官方 Caddy/CoreDNS 归档哈希，Agent 使用同一进程租约管理它们。代理与 DNS 只绑定指定内网地址；拒绝公共来源，DNS 转发并发有界且不记录查询。私有 CA 保持当前用户数据目录，续签由 Caddy 管理。首次信任和防火墙操作由操作者明确完成；不自动改系统信任、不提权。服务意外退出会关闭 Agent 自有服务，独立 Terminal Worker 不受影响。

WireGuard 客户端 DNS 指向该主机，信任导出的公有根证书，再访问三个 HTTPS 名称。父页 HTTP 会使 HTTPS 子框架失去安全上下文，故不能继续用 IP HTTP 作为内嵌入口。上游首次授权仍独立；真实浏览器登录、API、WebSocket 和 webview 验收不可用端口就绪替代。

## 收尾验收

操作者已确认手机通过私有 HTTPS/WireGuard 可以访问 Code 与 Harness；第三方小屏体验有限，终端继续作为主要工作流，两款应用保留可选入口。不把一般可用性确认扩展为所有扩展、OAuth 或输入法组合均已验收。

自有服务绑定原生服务器的一次性 listening 生命周期；网关首次启动失败必须显式关闭 Agent 并设置非零退出，关闭后禁止异步启动重新生成子进程；运行时失败共用同一回收路径，独立 Worker 保留。部署与本机授权共用 HTTPS 请求器：连接本机地址、按首个配置 Origin 验证名称，并以配置证书链建立本地显式信任；响应有界，证书错误立即失败，不关闭校验或修改全局信任。

集成请求共用一个实际的每 IP 预算，同一策略对象同时提供路由限流元数据；元数据不能替代运行时 allow 拒绝。授权突发请求的 429 有接口回归覆盖。生命周期启动不放在 HTTP 请求钩子中，不关闭或忽略静态安全查询。
