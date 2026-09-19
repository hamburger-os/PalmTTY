<!-- bilingual -->
# Security / 安全

## English

PalmTTY provides shell access with the privileges of the Windows user running the Agent. Treat compromise as workstation compromise.

### Required boundaries

- Run the Agent as a normal user, not Administrator.
- Default to loopback or a private overlay network.
- For non-loopback binding, PalmTTY refuses startup unless authentication, secure cookies and an explicit Origin allowlist are configured, unless the operator deliberately enables the unsafe LAN override.
- Authentication uses a bootstrap secret from an environment variable. The secret is exchanged only in a POST body and is never placed in a URL.
- Successful login creates an in-memory random session cookie with `HttpOnly` and `SameSite=Strict`; `Secure` is required for normal non-loopback deployment.
- Every state-changing HTTP request and terminal WebSocket handshake is checked against an exact trusted Origin.
- Authentication attempts and session creation are rate-limited in memory; limiter bucket state is itself bounded.
- Browser requests can select only configured workspace IDs; they cannot submit arbitrary working directories or shell executables.
- Terminal input, terminal output, access tokens and workspace environment values are excluded from default application logs.
- WebSocket input size, terminal dimensions, replay memory, retained exited sessions, login-session state and socket backpressure are bounded.
- Established terminal WebSockets are actively closed when their login session reaches its absolute expiry.

### Recommended deployment

Prefer:

```text
phone -> private overlay + HTTPS (for example Tailscale Serve) -> PalmTTY
```

or:

```text
phone -> HTTPS -> QNAP/Caddy -> LAN -> PalmTTY
```

The reverse proxy should be the only public endpoint. PalmTTY's upstream port should remain private.

### Current limitations

The alpha authentication mechanism is intentionally simple. It does not yet provide passkeys, persistent login sessions, per-device revocation, multi-user ACLs, or a privileged-helper separation. Login sessions are lost when the Agent restarts.

## 中文

PalmTTY 会以运行 Agent 的 Windows 用户权限提供 Shell。安全失陷应按“开发电脑账号被接管”处理。

### 必须保持的边界

- Agent 默认使用普通用户运行，不以管理员身份运行。
- 默认仅监听 loopback，或通过私有组网访问。
- 非 loopback 监听时，除非维护者明确启用危险的 LAN 例外，否则 PalmTTY 会要求认证、Secure Cookie 和明确的 Origin 白名单，不满足就拒绝启动。
- 认证使用环境变量中的启动 secret。secret 只通过 POST body 传递，绝不放入 URL。
- 登录成功后生成随机、仅内存保存的会话 Cookie，使用 `HttpOnly` 和 `SameSite=Strict`；正常的非 loopback 部署必须使用 `Secure`。
- 所有修改状态的 HTTP 请求和终端 WebSocket 握手都执行精确 Origin 校验。
- 登录尝试与创建会话都有内存限流，限流 bucket 本身也有数量上限。
- 浏览器只能选择本地配置中存在的 workspace ID，不能远程指定任意目录或 Shell 可执行文件。
- 默认日志不记录终端输入、终端输出、访问 token 或 workspace 环境变量值。
- WebSocket 输入大小、终端尺寸、重放缓存、已退出会话保留、登录会话数量以及慢客户端积压都有上限。
- 已建立的终端 WebSocket 在登录会话达到绝对过期时间后也会被服务端主动断开。

### 推荐部署

优先选择：

```text
手机 -> 私有组网 + HTTPS（例如 Tailscale Serve）-> PalmTTY
```

或：

```text
手机 -> HTTPS -> QNAP/Caddy -> 局域网 -> PalmTTY
```

公网只暴露可信反向代理，PalmTTY 自己的上游端口保持在内网。

### 当前限制

Alpha 阶段认证机制刻意保持简单，目前没有 Passkey、持久登录、按设备吊销、多用户 ACL 或独立提权 helper。Agent 重启后登录会话会失效。
