# 自托管 Web 工具架构

PalmTTY 仅提供外部入口，不代理 VS Code/Harness 的 HTTP/WebSocket，不复制第三方会话，也不接管其启动、退出或登录。

## VS Code Web
Windows 主机可单独运行微软官方 `code serve-web`。所有 PalmTTY Workspace 共用单一主机级入口；初版进入 VS Code 后手动选择工作目录，不自动生成带工作区路径的 URL。VS Code 自己管理编辑器、扩展、Shell 和连接令牌。Codex CLI 仍只是 Terminal 的 startupCommand。

用户实测表明 Windows 本机 serve-web 可打开项目，但 Ctrl+C 后可能残留服务端子进程及端口；因此当前不由 PalmTTY 管理程序生命周期。不得猜测 PID 后强制结束其他 VS Code 进程。

## 独立 Harness
Harness 在首页与 Workspace 平行。DSH 的 Workspace、Session、模型和认证全部由 DSH 管理；PalmTTY 不保存第二份。

## 配置与安全
- `integrations.vscodeWeb` / `integrations.harness` 为可选的服务器运营者 URL。只允许 HTTPS 或 loopback HTTP，拒绝用户名密码、查询和片段。
- 经 PalmTTY 登录认证才可从 `GET /api/v1/integrations` 获取这些公开入口。接口不缓存、不接受浏览器任意代理 URL。
- `?tkn=` 和 `?token=` 属于上游登录秘密，不写 PalmTTY 配置和日志；上游认证不关闭。
- 手机的 loopback 地址不指向 Windows；移动端跨设备 HTTPS 访问需要独立安全部署，本轮不提供 Caddy、VPN、Azure Tunnel 或 SSO。

Workspace V4 删除 Remote App 数据；运行时不读取旧 V3。卸载旧 WebRTC/RDP 仅是功能取消，不削弱终端 Worker 的恢复/认证约束。

## 验收缺口
VS Code Codex 扩展、浏览器文件夹深链接、真实手机访问、DSH 登录会话和独立服务长期运行仍需实机验收。完成链接入口不等于完成这些外围能力。

## 一次性升级

关闭 PalmTTY Agent 并备份工作区存储后，用 `node scripts/migrate-workspaces-v4.mjs --from <v3-file> --to <v4-file>` 离线转换。先执行 `pnpm --filter @palmtty/protocol build`，确保转换工具使用当前版本的唯一 Workspace Schema 校验。数据不合法或 ID 重复时拒绝创建 V4 文件。导出时先写入并同步同目录临时文件，再用独占硬链接原子发布，拒绝覆盖已有 V4；要求目标文件系统支持硬链接，临时文件始终清理。输出文件必须不存在，V3 原件保留，V4 只保存现有 Workspace/Terminal 字段，移除旧 Remote App Profile。运行时不提供自动 V3 回退。
