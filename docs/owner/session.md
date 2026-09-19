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

每个 Worker 在用户 runtime 目录保存最小恢复状态：

- Session ID；
- endpoint ID；
- workspace ID；
- createdAt；
- Worker/Shell PID（仅诊断）；
- 独立 secret 文件。

Unix 平台目录/文件使用 0700/0600。Windows 位于当前用户应用数据目录，并且 IPC 仍必须通过 secret 认证。

Agent 启动后并行扫描 record，再用 secret 实际连接并认证 Worker。连接/认证失败的 stale record 会被删除。不会因为 record 里写了某个 PID 就 kill 该 PID。

Worker 也会周期性验证自己的 record + secret 仍然存在且属于自己；恢复能力被删除或替换且持续失败时，Worker 会自我终止，避免长期留下不可恢复的 PTY。

## 当前限制

- 同一个 Session 可以有多个浏览器连接，但产品仍是单用户模型。
- resize 采用最后一次有效尺寸。
- 并发 Session 数量由配置限制，并发创建也计入限制。
- Session ID 和 endpoint ID 使用随机值，不暴露目录、用户名或 PID。
- 已退出 Session 默认保留 30 分钟，之后 Worker 释放 xterm、replay 和 metadata 并退出。
- 登录会话属于 Agent 内存；Agent 重启后终端仍在，但浏览器需要重新登录。

## Workspace

Workspace 是本机配置，不是浏览器动态创建的数据。它定义 ID、显示名称、工作目录、Shell、Shell 参数、可选启动命令和可选环境变量覆盖。

浏览器只能提交 workspace ID。

## 你审查时重点看

任何允许浏览器直接传 cwd、shellPath、环境变量或任意启动命令的改动，都意味着安全边界扩大，需要单独审查。

任何把 canonical terminal state 从 Worker 复制回 Agent 的设计，都需要重新论证 Agent 重启一致性。
