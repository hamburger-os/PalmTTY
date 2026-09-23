# 会话模型

## 目标

一个 PalmTTY Session 对应一个独立 Session Worker。Worker 持有唯一 PTY，并维护恢复该终端所需的 canonical state。

会话内可以运行宿主 Shell 或 Windows 上的 WSL Shell，也可以由 workspace 自动启动 Codex 等 CLI。Windows 仍以 PowerShell 7/ConPTY 为首要路径；Ubuntu CI 同时覆盖 Unix host runtime。

## 进程模型

~~~text
PalmTTY Agent
    │ authenticated local IPC
    ▼
Session Worker
    ├─ PTY / ConPTY
    ├─ headless xterm
    ├─ seq + replay
    └─ retention timer
         │
 Host shell / WSL / CLI
~~~

每个 Session 一个 Worker，Worker 之间相互隔离。某个 Worker 或 PTY 崩溃不会要求其他 Session 一起退出。

## 生命周期

~~~text
创建
  ↓
Worker + PTY running
  ├─ 浏览器断开 ──> 仍 running
  ├─ Agent 退出/重启 ──> 仍 running
  ├─ 新 Agent 认证并发现 ──> 同一 Session
  └─ Shell 自然退出 ───────────────────────┐
  └─ 用户请求“终止” → stopping → exited ─┤
                                           ↓
                                      retention
                              ┌────────────┴────────────┐
                              │                         │
                         用户“清除”                retention 到期
                              │                         │
                              └────> Worker 自清理并退出┘
~~~

当前会话实现浏览器断线持久化和 Agent 重启持久化。产品动作严格区分“终止”“重启”和“清除”：终止只结束 PTY/进程并进入 `stopping → exited`，退出后的 snapshot/replay 仍按 retention 保留；重启会等待旧 PTY 退出、retire 旧 retained Session，再按同一 Workspace 创建一个新的 Session，因此 Session ID 与终端历史都会更换；清除只允许用于 `exited/failed` Session，并要求 Worker 立即释放 terminal state、recovery metadata 后退出。Session 附件跟随同一个 Session ID：终止后在 retention 内仍可查看，重启会随旧 Session retirement 清理，显式清除/retention 到期也会清理。

明确不承诺：

- Windows/主机重启后的 PTY 持久化；
- 用户注销后继续运行；
- Worker 自身被系统或用户终止后的恢复。

## Session 图片附件

图片附件不是 PTY 数据，也不写入 Workspace/Git 工作树。Agent 在当前用户私有 runtime 下维护独立的 Session attachment store，使用随机文件名和持久元数据记录原始显示名、真实 MIME、尺寸、创建时间以及当前 runtime 可读路径。Session 创建时的 launch runtime 身份（Host，或 WSL + distribution）同时写入 Worker recovery record；附件路径映射只读取这份不可变 Session 身份，不重新读取后来可能被编辑的 Workspace。上传仅允许 PNG/JPEG/WebP/GIF，服务端根据文件签名与头部尺寸判断类型，不信任浏览器声明的 MIME/扩展名；单文件 8 MiB、每 Session 32 个、合计 64 MiB，图片边长最多 8192，且总像素不超过 32 MiPixels。

Host Session 直接得到宿主机私有附件路径；Windows WSL Session 通过结构化 `wsl.exe` + `wslpath` 映射为发行版可读路径，并继续剔除 PalmTTY 控制/认证环境。Web 的“插入路径”只向现有终端输入流写入路径文本和一个空格，不发送回车，因此不会因为查看/选择图片自动执行 Shell/CLI 命令。Codex、Antigravity 等是否把该路径识别为图片上下文仍属于其各自 CLI 行为，PalmTTY 核心不编码厂商协议。

附件元数据/文件由 Agent 管理，但生命周期以 Worker recovery record 为锚：Agent 重启后，只要对应 Worker record 仍存在，附件目录继续可发现；Session retirement/明确死亡后由 SessionManager 清理，若清理时 Agent 崩溃，下次启动还会按现存 Worker records 删除 orphan attachment 目录。

## Recovery metadata

每个 Worker 在与私有 Worker IPC generation 对齐的用户 runtime 目录保存最小恢复状态。当前 `WORKER_PROTOCOL_VERSION = 5` 使用 `runtime-v5`；本代在既有显式 `stopping` / retained-session retirement 基础上，把 Session 创建时的 launch runtime 身份纳入 Worker recovery authority。升级内部 Worker 协议 generation 时必须同步切换 runtime generation，不读取上一代 recovery state。

- Session ID；
- endpoint ID；
- workspace ID；
- 创建时的 launch runtime 身份（Host，或 WSL + distribution），为本 generation 必填；
- createdAt；
- Worker/Shell PID（仅诊断）；
- 独立 secret 文件。

Unix 平台目录/文件使用 0700/0600。Windows 位于当前用户应用数据目录，并且 IPC 仍必须通过 secret 认证。

Agent 启动后并行扫描 record，再用 secret 实际连接并认证 Worker。连接/认证失败本身不再被当作“Worker 已死”的证明：如果记录的 Worker 进程可以明确判定为不存在，才清理该 recovery state；如果进程仍存活或无法可靠判定，则保留 recovery capability，避免控制面短暂故障间接终止活 PTY。无论如何都不会因为 record 里写了某个 PID 就直接 kill 该 PID。

Recovery metadata 属于 Worker 自己的 canonical lifecycle state。Worker 会周期性验证 record + secret：如果文件只是缺失，会重新发布自己的 record/secret；如果现有 record/secret 与当前 Worker 身份冲突，则连续失败后 fail closed 并终止 PTY，避免覆盖另一份恢复权限。

## 当前限制

- 同一个 Session 可以有多个浏览器连接，但产品仍是单用户模型。
- resize 采用最后一次有效尺寸。
- 并发 Session 数量由配置限制，并发创建也计入限制。
- Session ID 和 endpoint ID 使用随机值，不暴露目录、用户名或 PID。
- 已退出 Session 默认保留 30 分钟；用户可在 retention 内重新进入查看最后状态，也可以显式“清除”立即让 Worker 释放 xterm、replay 和 metadata 并退出。
- 登录会话属于 Agent 内存；Agent 重启后终端仍在，但浏览器需要重新登录。

## Workspace

Workspace 不再写入 `palmtty.local.yaml`，而是 Agent 当前用户应用数据目录中的版本化持久化状态。Web UI 可以通过受认证 + 精确 Origin 保护的 API 创建、编辑和删除 workspace；Session 创建协议仍只提交 workspace ID。

Workspace 定义包含显示名称、工作目录、runtime、Shell、Shell args、有界环境变量与可选多行启动命令。Host runtime 在创建/修改与启动 Session 时验证本机目录和 Shell，并把 Shell 解析成绝对 executable；Windows 新 Session/重启还会重新读取当前 Machine/User 环境后再应用 Workspace 环境变量。Windows WSL runtime 使用 `wsl.exe`，把 distribution、Linux cwd、Shell/args 作为结构化 argv 交给 PTY，不通过字符串插值拼命令，并通过 `WSLENV` 转发 Workspace 环境变量名。

正在创建或运行中的 Session 会阻止删除对应 workspace；Session 退出后即使仍处于 retention，也可以删除 launch template，已退出 Session 继续由 Worker 自己完成 retention/清理。编辑只影响后续新建 Session，已经运行的 Worker 保留创建时的规范化运行规格。

## 你审查时重点看

Workspace CRUD 属于明确的高权限配置操作。网页可以管理 cwd/Shell/有界 environment，这是有意的持久化配置边界；不能继续退化成 Session 创建或重启接口直接接受任意 cwd/shell/env。环境变量值可能敏感，默认日志不得记录，也不应把 Workspace 当作密钥保险箱。

任何把 canonical terminal state 从 Worker 复制回 Agent 的设计，都需要重新论证 Agent 重启一致性。

会话按钮语义也属于生命周期契约：运行中的 Session 使用明确“终止”动作，已退出 Session 使用明确“清除”动作，不再用一个含义模糊的 × 同时承担关闭、杀进程或删除资源。
