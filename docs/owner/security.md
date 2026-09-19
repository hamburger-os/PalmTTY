# 安全架构

## 风险等级

PalmTTY 提供的是开发电脑 Shell，而不是普通网页功能。

一旦 PalmTTY 被未授权访问，攻击者可能获得当前 Windows 用户可访问的源码、Git/SSH 凭据、开发工具和其他文件。因此安全边界必须按“远程 Shell”设计。

## 当前安全模型

### 默认暴露范围

默认监听 `127.0.0.1`。

如果配置为非 loopback 地址，正常模式下必须同时满足：

- 开启认证；
- 使用 Secure Cookie；
- 配置明确的 trustedOrigins。

否则 Agent 拒绝启动。

存在 `unsafeAllowInsecureLan` 作为显式开发逃生口，但启用后会产生警告，不能用于公网部署。

### 登录

- 启动 secret 从环境变量读取，默认变量名为 `PALMTTY_ACCESS_TOKEN`；
- secret 至少 16 个字符；
- 浏览器通过 POST body 提交，不放 URL；
- 服务端只保存 secret 的摘要用于比较；
- 登录成功后生成随机会话 ID；
- Cookie 使用 `HttpOnly` 与 `SameSite=Strict`；
- 公网/反代部署要求 `Secure`；
- 登录会话只保存在内存并有过期时间，同时有最大会话数量上限；超出时淘汰最旧会话。
- 已建立的终端 WebSocket 也受登录会话绝对过期时间约束，到期后服务端主动断开，不能靠“连接已经建立”绕过登录过期。

### Origin

所有修改状态的 HTTP 请求，以及终端 WebSocket 握手，都要求精确 Origin 匹配。

Origin 只是浏览器跨站隔离手段，不能替代认证。

### 权限边界

- 浏览器只能选择 workspace ID；
- 不能远程提交任意工作目录或 Shell 路径；
- Agent 默认不提权；
- PTY 子进程继承 Agent 用户权限；
- 默认日志不记录终端 I/O 或 secret。

### 资源限制

- 登录和创建会话有内存限流，限流 bucket 数量本身也有上限；
- 会话数量有限制；
- WebSocket 消息大小有限制；
- 终端尺寸有限制；
- replay 和慢客户端缓冲有限制。

## 仍需加强

当前属于可用 Alpha 安全模型，后续可以增加：

- Passkey/WebAuthn；
- 按设备管理和吊销登录；
- 更完整的审计事件，但仍不记录终端内容；
- 独立 session worker 后的本地 IPC 认证；
- 更完善的可信反向代理配置。

## 你审查时重点看

安全代码修改必须回答三个问题：

1. 是否扩大了远程调用者能控制的内容？
2. 是否增加了 secret/终端内容进入日志或 URL 的可能？
3. 是否破坏了认证 + Origin + HTTPS 三层边界？
