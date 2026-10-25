# 官方 VS Code Web 与 Harness 的独立 Web 入口

## 管理边界

PalmTTY 首页固定展示微软官方 **VS Code Web（`code serve-web`）**和 DeepSeek Harness；它们不创建新的 Workspace 或 Terminal Session 类型。Web 应用身份、状态定义于 `@palmtty/protocol`，Agent 提供认证状态 API，浏览器只展示状态和安全入口。

- **VS Code Web**：仅发现主机上官方 `code` CLI（Windows 用户级/系统级安装目录与 PATH，Linux 常见目录与 PATH），以及部署者配置的 `integrations.vscodeWeb`。微软官方 VS Code Server 许可不允许将其作为托管服务。PalmTTY Agent 不自动安装、不作为 Agent 子进程启动、不停止官方 Server，也不冒认未知端口进程。源码 checkout 提供明确由当前用户在交互式终端执行的 `pnpm start:with-vscode` 前台联合启动器；它与 Agent Web API、系统自启无关，只负责这次自己创建的官方 CLI 子进程。部署者需在符合许可的交互式用户会话中独立运行 `code serve-web`。配置 URL 或发现 CLI 不能证明 Web 服务正在运行。
- **Harness**：先复用已知 CLI，否则在用户隔离目录用 npm 安装锁定 `@deepseek-ai/dsh@0.2.1-rc.2`。Windows/Linux 安装包捆绑官方 Node 24/npm，源码部署则需要系统 npm 和 Registry 访问。用随机回环端口启动自有子进程；先在临时同卷目录完成 npm 安装，校验包名、版本及入口后再发布到正式目录。错误状态不会被轮询抹除；只有重试触发新的安装/启动。监听自有子进程关闭，关闭 Agent 时只终止自有进程并有界等待，未知 PID 或第三方进程绝不可被清理。

`GET /api/v1/integrations` 需登录且 no-store，`POST /api/v1/integrations/:id/ensure` 还需精确 Origin 校验，且只接受协议中定义的应用 ID。`vscodeWeb` 的 ensure 仅重新发现官方 CLI；`harness` 的 ensure 可触发有界安装/启动，不接受任何客户端提供的路径、端口、版本或命令。

## 用户显式前台联合启动

`pnpm build` 后，在拥有官方 VS Code 安装且已配置 PalmTTY Token 的用户交互式终端中执行 `pnpm start:with-vscode`。它在启动任何进程前检查 Agent 构建文件、配置和官方 `code` CLI，不允许通过非交互式 TTY 启动，不自动接受微软许可。官方 Web 使用 `--host 127.0.0.1`、配置中的回环端口（否则 8000）；使用官方生成/要求的连接令牌，不传递 `PALMTTY_*` 或 PalmTTY bootstrap Token 环境变量。Agent 仍由原本入口启动，关闭联合启动器时只清理本次创建的进程树，不接管未知 PID。Windows `code.cmd` 通过已转义的 PowerShell 命令在当前用户控制台执行；Linux 启动真实 `code` 可执行程序。

`pnpm start` 仍然只启动 Agent；发行版 `palmtty service` 和源码 `pnpm autostart` 仍然只启动 Agent。微软官方许可限制以微软文档为准；这个助手不把 VS Code 服务器作为 PalmTTY 内嵌发行产品提供。上述联合脚本是用户明确发起的前台辅助工具，不是无人值守服务模式。Windows 实机子进程树清理与首次许可证提示需验证。

## 安全边界

官方 VS Code Web 与 Harness Web 分别拥有独立浏览器 Origin、认证与工作区；第三方 JavaScript 绝不能通过 PalmTTY 已登录的同源路径反代。外部访问 URL 只允许无凭据、无查询字符串和片段的 HTTPS（本机回环 HTTP 例外），不代表远程访问已安全就绪。

DSH 官方 Web 首次登录会使用自己的临时进程令牌 URL，仅向 `local` 暴露模式下受认证的同机浏览器返回；远端 LAN/NAS 不接收该 URL。PalmTTY 不持久化、记录或复用上游令牌，不共享自己的认证 Cookie。VS Code Web 固定监听 Agent 主机的 `127.0.0.1`：同机 HTTPS 反向代理可以代理它；另一台机器上的 NAS 无法直接连接这段 loopback。跨主机必须另建受保护的隧道到该主机回环，不能为方便而直接暴露无 TLS 的 Web 服务器到公网。

独立 HTTPS 代理下的 DSH 必须由部署者正确配置上游 `--public-url`、`--trusted-host`、WebSocket 与认证；当前本机自动启动模式不自动建立手机访问路径。

## 验收与局限

仍需实机验证 Windows/Linux 官方 CLI 检测、微软服务器交互式启动与登录、浏览器扩展（包括 Codex）、手机 HTTPS、DSH 首次在线安装与长期登录、Windows 子进程树清理。现有 CI/打包 Smoke 不能代替这些跨网络测试。绝不将“检测到 VS Code”写作“官方 Web Server 已成功启动”。

Workspace V4 仅有 Workspace 与 Terminal Profile；不恢复已取消的 Remote App/WebRTC/RDP，也不引入旧配置键兼容。旧 V3 必须关闭 Agent 后备份、构建协议包并使用 `node scripts/migrate-workspaces-v4.mjs --from <v3-file> --to <v4-file>` 显式离线转换。
