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

## 显式“重启终端”不是重连

浏览器重连、页面刷新和 Agent 重启都必须尽量附着**同一个** Worker/PTY/Session，并保留原 canonical terminal state。终端页的“重启终端”则是用户明确触发的破坏性替换动作：Agent 先解析并验证最新 Workspace 与宿主环境，只有 replacement 可启动时才终止旧 PTY；旧 Session 退出后先创建、认证并 adopt 新 Worker，成功后才 retire 旧 Session。新 Worker 创建失败时保留旧会话历史与附件供查看和重试，但已终止进程不能恢复。它不会被网络重连或 Agent 恢复流程隐式触发。

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

## 手机返回前台：最新状态优先（2026-10）

终端恢复分为两条路径：短暂网络断线保留原 xterm 和最近序号，让 Worker 有界增量重放；后台超过 1.5 秒、浏览器渲染超载或序号/几何错误时才重建视图，以 lastSeq=0 从同一 Worker 获取最新 Snapshot，不快放旧渲染队列。WebSocket 断开有退避重试；可见性恢复不会重启 Shell/CLI。Worker 仅在缺失数据不超过 64 帧、64 KiB 且几何一致时使用 Replay，超限直接 Snapshot。即使 WebSocket 尚未断开，浏览器端输出渲染队列超过预算也会主动重新附着。

与“刷新整个页面”不同，新恢复仅作用于 TerminalView，不销毁 WorkspaceWorkbench/Agent/PTY。输入在恢复边界完成后才重新放行。网页后台暂停和 iOS/Android 真机效果仍需设备实测；不能承诺所有平台在系统挂起后实时保活。

## 2026-10 有界恢复与单一控制者

每个 Terminal Session 的输入与 resize 仅由一位已认证连接控制；额外连接以 Worker 规范尺寸的快照进入只读模式，当前控制者离线后才允许显式接管。控制租约是 Agent 内存态，不能当成多用户认证。控制权变化不会创建新的 PTY，几何变更可要求观察者重新连接。

移动端在 Wi-Fi / 蜂窝网络之间切换时，旧 TCP/WebSocket 可能在 Agent 仍显示 OPEN，导致新连接只读且显式接管被拒。浏览器现在为同一个 TerminalView/Session 生成内存态的 128-bit 随机连接身份，通过已认证的 `resume` 发送；Agent 仅允许相同身份的新 socket 原子替换旧控制者，并关闭旧 socket、撤销旧 Worker 订阅。不同身份的已认证连接仍不能抢占在线控制者。Agent 还每 15 秒发送 WebSocket ping，连续未收到 pong 后约 45 秒强制断开失效连接、回收控制权，覆盖页面刷新或浏览器关闭导致身份丢失的情况。控制权未获批准时前端明确提示占用状态，用户可稍后重试。此身份不是登录凭据，不放入 URL/日志/持久化存储；更换网络时不终止 Worker/PTY。

浏览器短断线保留 xterm/seq，后台挂起与渲染过载重建视图。重放缓存有独立帧数和字节预算，Worker IPC 使用增量解析，序列化快照最多 4 MiB并优先削减旧 scrollback。可见屏幕仍超过预算时恢复失败，但不会杀 CLI。Worker 在 PTY→headless 待处理输出超过 512 KiB 时 pause 原生 PTY 读取，低于 128 KiB 时恢复。批次合并解析但保留逐帧 seq。真实 Windows/WSL/手机压力测试仍待验证。

## 协议升级后的已有会话恢复（2026-10-11）

浏览器与 Agent 的终端 WebSocket 协议同时为 `palmtty.v4`；更新网页而没有重启旧 Agent，可能收到 1002 协议错误，手机端现在直接给出重启 Agent + 完整刷新网页的提示，而不是无限次重连。

Session Worker 独立于 Agent 存活。#100 升级浏览器协议时没有改变 Worker IPC v5，因此旧 Worker 可以认证却会发出 `hello.protocol=3`；新版 Agent 如直接使用 v4 浏览器消息 schema 校验，就会主动断开旧 Worker IPC 并循环重连。现在只在**经过 secret 认证的本地 Worker 通道**对这一种旧 `hello` 进行 v4 投影，不改变 PTY/Worker 寿命，也不向浏览器开放旧协议。不得为解决升级重连而自动终止 Session Worker。

## SGR 鼠标编码与快照恢复（2026-10-15）

Worker headless parser 负责识别 PTY 输出中的 DECSET/DECRST 1006（SGR）、1016（SGR pixels）和 RIS（xterm 不支持 1015） 硬重置；xterm SerializeAddon 本身序列化鼠标 tracking mode，但遗漏独立的鼠标**编码格式**。因此 Worker 把当前编码切换追加到相同的 canonical snapshot，计入既有 4 MiB 上限。浏览器恢复时不根据应用名默认开启 SGR，更不转发无法通过 UTF-8 字符串通道安全保真的 X10/onBinary。未变更 Session 协议、Agent 权限或 PTY 所有权。

恢复操作不能重建 TUI 内部对话历史：普通 buffer scrollback 来自 Worker 镜像，全屏 alternate-buffer 中的滚动位置必须由仍运行的 TUI 自己维护并响应有效滚轮或键盘操作。

## 已退出会话重新查看时的几何（2026-10-16）

`exited` / `stopping` 的保留会话是只读终端记录：从不同 cols/rows 的浏览器重新附着时，Worker 不再 resize Headless Terminal，而是在原规范尺寸下发送有界快照。仍在运行的 Session 则维持先 resize PTY 与镜像、再发送新尺寸快照的既有语义。浏览器得到快照后采用消息中的 canonical cols/rows，避免反复几何不匹配重连。

手机后台超过 1.5 秒后的防快放重建策略保持现状，避免未经真机验证就移除已有保护。Regular 滚动可用不代表 Fullscreen TUI 鼠标滚轮已经通过真机验收。
