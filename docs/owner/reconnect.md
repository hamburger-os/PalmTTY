# 会话重连与状态恢复

## 核心语义

PalmTTY 不把网页、Agent 或网络连接的生命周期等同于终端生命周期。手机换网、锁屏、页面刷新，以及 Agent API/Web 进程重启，都不应结束正在运行的 Host/WSL Shell、Codex 或其他 CLI。

## Canonical state 在 Worker

每个 Session Worker 同时维护：

1. 真实 PTY：Host/WSL Shell、Codex 或其他 CLI 进程；
2. Headless Terminal 镜像：当前屏幕与有限 scrollback；
3. 有界 Replay Buffer：最近一段带序号的增量输出。

Agent 只做代理，不保存第二份 canonical seq/replay/snapshot。

所有 PTY 输出在 Worker 内经过同一个有序流水线：

~~~text
PTY 输出
  ↓
更新 headless xterm
  ↓
分配 seq
  ↓
写入有限 replay
  ↓
通过 IPC 发送给当前 Agent
  ↓
浏览器 WebSocket
~~~

因此即使 Agent 此时不存在，Worker 仍持续更新 mirror、seq 和 replay。

## 浏览器恢复

浏览器重新建立 WebSocket 时先对当前容器执行一次 `fit`，然后在 resume 中同时发送最后收到的 `lastSeq` 与当前 `cols/rows`。恢复开始后浏览器冻结后续 fit，直到 Worker 发出恢复完成边界。

Worker 在同一个有序操作内先比较并应用几何尺寸，再决定恢复方式：

- cols/rows 与 canonical geometry 相同且缺失输出仍在 replay buffer：补发缺失帧；
- cols/rows 发生变化：先 resize PTY 与 headless xterm，再强制发送新 geometry 下的 terminal snapshot，不 replay 旧 geometry 产生的字节流；
- lastSeq 太旧或页面没有旧状态：发送当前 terminal snapshot；
- 从未产生 PTY 输出（seq = 0）：snapshot 确定为空字符串。

snapshot/replay 帧之后才发送 `hello`；浏览器把 `hello` 作为 recovery-complete marker，并在此前的 xterm write 全部解析完成后才允许输入与重新 fit。恢复消息生成与 live subscription 建立仍位于同一个 Worker 有序操作中，避免 snapshot/replay 与下一帧实时输出之间出现窗口。

## Agent 重启恢复

Agent 启动时：

1. 扫描本地 Worker record；
2. 读取对应私有 secret；
3. 连接 Windows Named Pipe / Unix socket；
4. 完成 Worker protocol version + secret 认证；
5. 获取最新 SessionPublic 状态并恢复 registry。

Agent 正常关闭只断开控制连接，不终止 Worker。Agent 异常退出时本地 IPC 也会自然断开，Worker 继续运行。

浏览器登录 session 目前只在 Agent 内存中，因此 Agent 重启后用户需要重新登录；重新登录后可 attach 原 Session。

## Agent↔Worker 控制连接恢复

Agent 与 Worker 之间有应用层 ping。控制 IPC 异常关闭时：

- 当前浏览器 terminal socket 以服务恢复语义断开；
- Agent 按有上限的退避间隔持续重新认证同一 Worker；
- 成功后继续保留该 Session；
- 只有能够明确判定记录中的 Worker 进程已经不存在时，才移除该 recovery metadata；
- IPC 暂时不可达、权限暂时不足或进程身份无法可靠判定时，优先保留 Worker 的恢复能力，而不是把控制面故障转换为 PTY 终止。

Agent 启动时对已有 Worker 的 rediscovery 仍使用约 8 秒的有限重试窗口，并行处理多个 record，避免大量不可达 record 串行拖慢启动；窗口结束后未连接但可能仍存活的 record 会被保留，而不是被删除。新 Agent 可在下一次启动重新尝试。Session 创建阶段的 `adopt` 采用幂等提交语义：响应丢失时创建端会重新连接同一 Worker 并重复 adopt，避免“API 失败但 Worker 已持久化”的不确定提交窗口。Worker 自己周期性验证 recovery state：缺失文件会重新发布，身份冲突则 fail closed。

## 内存与慢客户端

- replay buffer 有字节上限；
- headless scrollback 有行数上限；
- terminal input 在浏览器协议和 Worker IPC 两层均限制为 64 KiB；
- Worker IPC frame 有硬上限；
- Agent↔Worker socket 有积压上限；
- 浏览器 WebSocket 有 bufferedAmount 上限；
- 慢客户端被断开后通过 replay/snapshot 恢复，不能阻塞 PTY；
- 浏览器应用层 ping/pong 继续负责发现移动网络半开连接。

## 明确非目标

当前不实现 OS reboot persistence。

主机重启、用户注销或 Worker 进程本身结束后，不尝试从磁盘恢复“活的 PTY”。

## 你审查时重点看

- PTY、headless xterm、seq、replay 是否仍由同一个 Worker 持有；
- recovery attach 是否仍无消息窗口；
- Worker IPC 是否认证且有界；
- Agent 关闭是否只断控制面；
- stale/orphan cleanup 是否避免 PID reuse 风险；
- browser 和 Worker 两层 backpressure 是否都存在。
