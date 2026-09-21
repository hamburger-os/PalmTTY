# 会话模型

## 目标

一个 PalmTTY Session 对应一个独立 Session Worker。Worker 持有唯一 PTY，并维护恢复该终端所需的 canonical state。

会话内通常运行 PowerShell 7，也可以由本地 workspace 配置自动启动 Codex 等 CLI。

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
     PowerShell / CLI
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
  └─ Shell 退出/用户终止
              ↓
            exited
              ↓
         retention 到期
              ↓
        Worker 自清理并退出
~~~

当前会话实现浏览器断线持久化和 Agent 重启持久化。

明确不承诺：

- Windows/主机重启后的 PTY 持久化；
- 用户注销后继续运行；
- Worker 自身被系统或用户终止后的恢复。

## Recovery metadata

每个 Worker 在与私有 Worker IPC generation 对齐的用户 runtime 目录保存最小恢复状态。当前 `WORKER_PROTOCOL_VERSION = 2` 使用 `runtime-v2`；升级内部 Worker 协议 generation 时必须同步切换 runtime generation，不读取上一代 recovery state。

- Session ID；
- endpoint ID；
- workspace ID；
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
- 已退出 Session 默认保留 30 分钟，之后 Worker 释放 xterm、replay 和 metadata 并退出。
- 登录会话属于 Agent 内存；Agent 重启后终端仍在，但浏览器需要重新登录。

## Workspace

Workspace 是本机配置，不是浏览器动态创建的数据。它定义 ID、显示名称、工作目录、Shell、Shell 参数、可选启动命令和可选环境变量覆盖。

Agent 启动 preflight 会验证所有 workspace 目录，并按最终环境解析 Shell；进入 Worker bootstrap 的不是原始 shell 名称，而是包含绝对 executable 的规范化 runtime spec。这既提高 Windows 可诊断性，也避免 PTY 库内部 PATH 解析差异成为运行时依赖。

浏览器只能提交 workspace ID。

## 你审查时重点看

任何允许浏览器直接传 cwd、shellPath、环境变量或任意启动命令的改动，都意味着安全边界扩大，需要单独审查。

任何把 canonical terminal state 从 Worker 复制回 Agent 的设计，都需要重新论证 Agent 重启一致性。
