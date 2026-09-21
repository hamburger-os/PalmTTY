# 安全架构

## 风险等级

PalmTTY 提供的是开发电脑 Shell，而不是普通网页功能。安全失陷应按当前 OS 用户权限被远程接管处理。

## 外部访问边界

默认监听 127.0.0.1。非 loopback 正常模式必须同时开启认证、Secure Cookie 和明确 trustedOrigins，否则 Agent 拒绝启动。unsafeAllowInsecureLan 仅作为显式开发逃生口。

## 浏览器认证

- 启动 secret 从环境变量读取，默认 PALMTTY_ACCESS_TOKEN；
- 浏览器只通过 POST body 提交，不放 URL；
- Agent 只保存摘要用于比较；
- 登录成功后生成随机内存 Session；
- Cookie 使用 HttpOnly、SameSite=Strict，正常非 loopback 部署要求 Secure；
- 登录 Session 有绝对过期和数量上限；
- 已建立 terminal WebSocket 到期后也会被主动关闭；
- Origin 与认证始终是独立控制。

登录 Session 不持久化，所以 Agent 重启后需要重新登录。

## Agent↔Worker 本地 IPC

每个终端 Worker 使用独立 256-bit 随机 secret。

安全规则：

- secret 只通过 Worker 创建时的一次性匿名 stdin bootstrap 传递；
- secret 不放 argv、URL、浏览器协议或普通日志；
- PalmTTY 登录 token 对应的环境变量在启动 Worker 前删除，并再次从 PTY 环境删除；Windows 下删除按环境变量名大小写不敏感语义处理；
- Worker 先验证 protocol version + secret，未认证连接不能 attach/input/resize/terminate/retire；
- 新 Agent 只有持有 recovery secret 才能接管控制连接；
- Worker secret 在用户 runtime 目录单独保存；
- Unix 目录/文件使用 0700/0600；
- Windows 使用当前用户应用数据目录的 OS ACL 作为文件边界，同时仍以 secret 作为 Named Pipe 应用层认证；
- terminal input 同时受 64 KiB 协议限制；
- IPC frame 和 socket backlog 均有硬上限。

Worker secret 是本地 capability，绝不发送给浏览器。

## Recovery 与 PID 安全

Worker record 中保存 Worker PID 和 Shell PID 仅用于诊断。

PalmTTY 不按持久化 PID 直接 kill 进程。PID 会复用，stale record 不能证明当前 PID 仍属于原 Worker。

清理与所有权策略：

- 已接管的 Worker 只通过 authenticated IPC 接受终止与 retained-session retirement 命令；`retire` 只允许在 `exited/failed` 状态执行，Agent 不能绕过 Worker 直接删除 recovery state；
- Session 创建采用 authenticated、幂等的 adoption transaction：READY 后 Worker 仍受短创建租约约束，`adopt` 可在响应丢失后通过新 IPC 连接安全重试；只有 adoption 得到确认才由 Agent 返回创建成功；从未提交 adoption 时由 Worker 自己在租约到期后杀 PTY并清理 recovery state，不需要独立 abort 控制命令，也不依赖持久化 PID；
- Agent 无法连接/认证 Worker 本身不构成删除 recovery metadata 的权限；只有能明确判定记录中的 Worker 进程不存在时才清理；
- 老旧 dangling secret/socket 文件仍按年龄清理；
- Worker 周期性验证自己拥有的 record + secret；缺失文件会由 Worker 重新发布；
- 如果已有 recovery record/secret 与当前 Worker 身份冲突，Worker fail closed，不覆盖另一份恢复权限。

## 权限边界

- Workspace CRUD 是显式高权限配置面，只有认证成功且 Origin 精确匹配的请求可以修改当前用户的持久化 workspace。
- Workspace 目录选择器也是“认证 + 精确 Origin”保护的显式 API，但只读且只枚举目录名称/绝对路径，不返回文件内容；Host/WSL 浏览均有限流、返回数量上限，WSL 还限制子进程输出与执行时间。
- Web workspace 可以配置 cwd、runtime、Shell、Shell args、有界 environment 与启动命令。Environment 是当前用户应用数据中的持久化配置，可能敏感但不是 secret vault；默认日志不得记录其值。当前认证 token 对应的环境变量名属于保留项，Workspace mutation 会拒绝持久化它；Worker bootstrap 和 PTY 仍继续执行剔除作为纵深防御。
- Session 创建与重启都只使用已持久化的 workspace authority，不允许用一次 Session 请求临时注入 cwd/shell/env。
- Workspace 新建/更新会验证运行目标，Session 创建/重启前再次验证；Host Shell 解析为绝对 executable，Windows 新终端先刷新 Machine/User 环境再应用 Workspace environment；WSL 通过结构化 argv 调用 `wsl.exe`，并仅通过 `WSLENV` 名称列表转发 workspace variables，不做用户命令字符串拼接。
- Shell Profile 探测与目录浏览一样要求认证 + 精确 Origin，并具有独立限流、输出与超时边界；探测只返回已知 Shell 的路径/参数，不提供任意命令执行。
- Agent/Worker 默认不提权；
- PTY 继承普通用户权限；
- 默认日志不记录 terminal I/O、token、Worker secret 或 workspace env。

## 资源限制

- 登录、创建 Session、Session lifecycle mutation、目录浏览与 Shell 探测分别限流；
- Session 数量有上限，并发创建也计入上限；
- browser WebSocket 消息和终端尺寸有上限；
- replay、scrollback、IPC frame、IPC backlog、browser backpressure 均有限制；
- exited Worker 有有限 retention。

## 仍需加强

当前仍是 Alpha 安全模型，后续可以增加 Passkey/WebAuthn、按设备管理和吊销登录、更完整但不记录终端内容的审计事件，以及 Windows Worker runtime 文件 ACL 的专项实机审计。

## 你审查时重点看

1. Workspace CRUD、目录浏览与 Shell 探测是否仍受认证 + 精确 Origin 保护；Session 创建/重启是否仍只消费持久化 Workspace authority，而不是接收临时 cwd/shell/env？
2. 是否让 secret/终端内容进入日志、URL、argv 或浏览器？
3. 是否破坏认证 + Origin + HTTPS 外部边界？
4. 是否允许未认证本地 IPC 控制 Worker？
5. 是否把 persisted PID 当成 kill authority？
