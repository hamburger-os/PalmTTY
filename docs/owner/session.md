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

每个 Worker 在与私有 Worker IPC generation 对齐的用户 runtime 目录保存最小恢复状态。当前 `WORKER_PROTOCOL_VERSION = 3` 使用 `runtime-v3`；升级内部 Worker 协议 generation 时必须同步切换 runtime generation，不读取上一代 recovery state。

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

Workspace 不再写入 `palmtty.local.yaml`，而是 Agent 当前用户应用数据目录中的版本化持久化状态。Web UI 可以通过受认证 + 精确 Origin 保护的 API 创建、编辑和删除 workspace；Session 创建协议仍只提交 workspace ID。

Workspace 定义包含显示名称、工作目录、runtime、Shell、Shell args 与可选启动命令。Web 模型不开放 env 覆盖。Host runtime 在创建/修改与启动 Session 时验证本机目录和 Shell，并把 Shell 解析成绝对 executable。Windows WSL runtime 使用 `wsl.exe`，把 distribution、Linux cwd、Shell/args 作为结构化 argv 交给 PTY，不通过字符串插值拼命令。

正在创建或运行中的 Session 会阻止删除对应 workspace；Session 退出后即使仍处于 retention，也可以删除 launch template，已退出 Session 继续由 Worker 自己完成 retention/清理。编辑只影响后续新建 Session，已经运行的 Worker 保留创建时的规范化运行规格。

## 你审查时重点看

Workspace CRUD 属于明确的高权限配置操作。允许网页管理 cwd/Shell 是这次有意扩大后的产品边界，但不能继续退化成 Session 创建接口直接接受任意 cwd/shell/env；env 仍不属于 Web workspace 模型。

任何把 canonical terminal state 从 Worker 复制回 Agent 的设计，都需要重新论证 Agent 重启一致性。
