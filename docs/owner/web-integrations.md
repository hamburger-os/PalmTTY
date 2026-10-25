# 本机 Web 开发应用管理

## 管理边界

PalmTTY 首页固定展示 **code-server** 和 **DeepSeek Harness**，与 Workspace、Terminal Session 独立。应用 ID、状态与响应结构统一定义在 `@palmtty/protocol`，Agent 是状态所有者，前端只展示 API 状态。

- **code-server**：只扫描当前主机已知目录与 PATH 的现有 CLI。它是独立部署和认证的开源 Web IDE；PalmTTY 不下载、不启动、不监督 code-server，不声明配置了访问地址就代表服务运行。与微软官方 `code serve-web` 无关，旧 `vscodeWeb` 配置键直接删除，没有兼容分支。
- **Harness**：复用已知 CLI，或通过本机 npm（发行版捆绑官方 Node/npm）在当前用户目录安装锁定的 `@deepseek-ai/dsh@0.2.1-rc.2`。Agent 仅启动和管理自己持有的回环随机端口子进程；不采用未知 PID 或端口，也不允许来自浏览器的任意软件版本和启动参数。
- **检测与失败**：受认证的轮询刷新安装检测；即使安装失败留下 CLI 文件，失败状态也不会被后续轮询自动清除，必须由用户重试。Harness 只认可官方 `dsh web:` 回环启动公告，并要求所拥有的子进程仍然存活。关闭监听在就绪等待前注册；Agent 停止时发出终止信号并有界等待。Windows 孙进程树彻底清理仍须实机验收。

## API 和 Origin

`GET /api/v1/integrations` 需登录、no-store；`POST /api/v1/integrations/:id/ensure` 另需严格 Origin 并只接受规范 ID。对 code-server 的 ensure 只重扫安装位置；仅 Harness 能启动/安装。客户端不能指定可执行文件、npm 包、端口和代理目标。

第三方 Web UI 不能代理到已登录 PalmTTY 的相同 Origin，不得共享 Cookie、Token 或 Worker 密钥。可选 `integrations.codeServer` / `integrations.harness` 只记录无凭据的 HTTPS 或本机回环 HTTP 地址。它们是访问入口，不负责安全代理配置、服务可用性和认证验证。

DSH 官方首次登录使用一次性进程令牌 URL 换取自己的 Cookie；仅在受认证的同机 `local` 浏览器可以看到。远端 LAN/NAS 不得获取该 URL；不能持久化或输出到日志。若在独立 HTTPS Origin 后部署 DSH，还需按官方要求正确配置 `--public-url`、`--trusted-host`、上游认证和 WebSocket。当前托管回环实例**不会自动完成远程配置**。手机端零配置使用、code-server 自动安装、Codex 浏览器扩展均不在已验证交付范围内。

## 验收缺口

需要 Windows/Linux 真实主机验收：首次在线下载、DSH Web 登录与长期会话、关闭后的进程树、手机上独立 HTTPS 访问、code-server 编辑和 Codex 扩展兼容性。发行态 smoke 验证捆绑 npm CLI 可执行，并未真实访问 npm Registry。

Workspace V4 只存核心 Workspace 与 Terminal Profile。旧 V3 不自动读取；如需转换，先备份并关闭 Agent，构建协议包后运行 `node scripts/migrate-workspaces-v4.mjs --from <v3-file> --to <v4-file>`，仅显式离线导出、不覆盖现有 V4。
