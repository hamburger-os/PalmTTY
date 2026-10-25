# 本机 Web 应用管理架构

## 管理边界

PalmTTY 为 VS Code Web 与 DeepSeek Harness 提供始终可见的一等状态入口，不增加 Terminal Session 或 Workspace 类型，也不重建远程桌面/应用画面。唯一管理者为 Agent 的有界受控应用管理器：发现安装、按需尝试安装、启动自己拥有的子进程、跟踪状态和失败诊断，禁止对未知 PID、已运行但未验证身份的端口或其他用户进程采取动作。

- VS Code：仅发现官方安装与向用户提供手动启动说明。微软的 VS Code Server License 不允许服务托管，所以不得把官方 `code serve-web` 包装成 Windows Service、后台 Agent 子进程，也不能擅自用端口占用结果判断服务身份。
- Harness：复用已知 CLI；缺失时调用本机 npm 安装锁定 `@deepseek-ai/dsh@0.2.1-rc.2` 至当前用户目录，然后以固定参数启动 `127.0.0.1:0` 的 Web 服务。安装不提权、不修改系统 PATH，也不创建长期系统服务。发行版仅打包 Node，不包含 npm 时呈现 npm_unavailable 状态。
- 单次认证登录可触发自动尝试，重试由显式按钮执行；管理器做 single-flight，状态来自 Agent 内部权威，前端只展示。退出 Agent 时仅结束它自己启动的 Harness 子进程。

## 访问安全

现有 NAS 仅反向代理 `https://haha.example.test/` → PalmTTY Agent 时，无条件增加 `/_apps/harness/` 路由会使第三方 JS 获得与已登录 PalmTTY 同等的浏览器 Origin 权限。严禁这种默认做法。不同端口也不隔离同主机 Cookie。第三方进程不继承 `PALMTTY_*` 或 PalmTTY 登录 token 环境。

- 管理 API 要求 PalmTTY 登录，POST 同时校验严格 Origin；拒绝客户端传入程序路径/命令/任意代理 URL。GET no-store。
- 本机浏览器在真正 local exposure 时可获得 DSH 一次性启动 URL。经 NAS 或 LAN 访问的浏览器不得收到回环的令牌 URL，也不能把一个外部电话浏览器的回环当成 Agent 地址。
- 手机的零额外配置 HTTPS 访问尚未实现；必须是单独 Origin 的受保护代理，并尊重上游 Cookie/Host/WebSocket/令牌安全机制。可选 `integrations` URL 仅代表独立外部访问地址。
- 上游软件升级和下载策略需固定版本、校验、单独安全复核；不得在每次启动时追随 `latest`。

## 现实验收边界

用户 Windows 主机是否安装 npm、官方 VS Code CLI 的准确位置、Harness Web 登录与长期运行、手机独立 HTTPS Origin、Codex VS Code 扩展和退出后子进程树仍需实测。完成进程探测不等于完成跨网络安全访问。

Workspace V4 删除 Remote App 数据；运行时不读取旧 V3。卸载旧 WebRTC/RDP 仅是功能取消，不削弱终端 Worker 的恢复/认证约束。

## 验收缺口
VS Code Codex 扩展、浏览器文件夹深链接、真实手机访问、DSH 登录会话和独立服务长期运行仍需实机验收。完成链接入口不等于完成这些外围能力。

## 一次性升级

关闭 PalmTTY Agent 并备份工作区存储后，用 `node scripts/migrate-workspaces-v4.mjs --from <v3-file> --to <v4-file>` 离线转换。先执行 `pnpm --filter @palmtty/protocol build`，确保转换工具使用当前版本的唯一 Workspace Schema 校验。数据不合法或 ID 重复时拒绝创建 V4 文件。导出时先写入并同步同目录临时文件，再用独占硬链接原子发布，拒绝覆盖已有 V4；要求目标文件系统支持硬链接，临时文件始终清理。输出文件必须不存在，V3 原件保留，V4 只保存现有 Workspace/Terminal 字段，移除旧 Remote App Profile。运行时不提供自动 V3 回退。
