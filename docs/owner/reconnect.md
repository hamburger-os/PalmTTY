# 会话重连与状态恢复

## 这是核心功能

PalmTTY 的目标不是“网页打开一个临时 Shell”，而是让手机网络切换、锁屏、浏览器页面刷新后，仍然能够回到原来的开发终端。

## 当前实现模型

服务端同时维护三类状态：

1. **真实 PTY**：PowerShell/Codex 进程真正运行的位置；
2. **Headless Terminal 镜像**：Agent 用 xterm headless 跟踪当前终端屏幕和 scrollback；
3. **有界 Replay Buffer**：保存最近一段带序号的增量输出。

所有 PTY 输出通过同一个有序流水线处理：

```text
PTY 输出
  ↓
更新 headless xterm
  ↓
分配 seq
  ↓
写入有限 replay
  ↓
发送给当前浏览器
```

因此 snapshot 的序号和浏览器后续收到的实时输出之间有清晰边界。

## 两种恢复方式

### 浏览器仍保留旧状态

浏览器重新建立 WebSocket 后发送最后收到的 `lastSeq`。

如果这段缺失输出仍在 replay buffer 中，Agent 只补发缺失帧。

### 页面刷新或丢失太多历史

如果浏览器没有旧序号，或者旧序号已经超出 replay buffer，Agent 发送当前 headless terminal 快照，然后从该序号继续实时输出。若会话尚未产生任何 PTY 输出（`seq = 0`），快照按定义就是空字符串，不需要调用 serializer；已有输出时才序列化 headless terminal。

## 内存与慢客户端

- replay buffer 有字节上限；
- headless scrollback 有行数上限；
- 每个 WebSocket 有待发送字节上限；
- 慢客户端超过上限后会被断开，之后通过恢复机制重新连接；
- 不能为了等待某个慢手机而阻塞 PTY 输出。
- 浏览器每 15 秒发送应用层 ping；45 秒没有 pong 时主动关闭旧连接并进入重连，避免手机切换 Wi‑Fi/蜂窝后长期卡在“看起来还连着”的半死连接。
- 客户端只在收到服务端 `hello`、确认恢复握手完成后发送 resize/input，服务端也按连接串行处理消息，避免 `resume` 与后续消息并发造成竞态。

## 当前没有实现的能力

**Agent 自身重启后找回原 PTY 尚未实现。**

未来需要把每个 PTY 移到独立 session worker，并通过 Windows Named Pipe 让新 Agent 重新发现 worker。

## 你审查时重点看

涉及以下内容的改动必须更新本文档：

- snapshot 生成位置；
- seq 生成规则；
- replay 截断规则；
- WebSocket backpressure；
- PTY 和 Agent 生命周期关系。
