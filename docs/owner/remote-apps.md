# Remote Apps 架构

## 定位

Remote Apps 是 PalmTTY 的第二类交互 Activity，用于从手机远程操作由 PalmTTY 在 Windows 宿主机上启动的**单个桌面应用窗口**。它不是 Terminal Session 的扩展，也不是完整 Remote Desktop。

核心资源模型现在明确分层：

~~~text
Workspace
├─ 基础：name / cwd / bounded environment
├─ Terminal profile
│  ├─ runtime: Host / WSL
│  └─ startupCommand
└─ Remote App profiles
   ├─ id / name
   ├─ executable
   └─ argv
~~~

Terminal 的 shell/runtime/startup 不再伪装成 Workspace 顶层属性；Remote App 的 FPS/最大宽高也不再进入持久 Profile。Workspace 只是权威容器，Terminal 和 Remote App 是两类独立 Activity 配置。

## 进程与数据面

~~~text
Phone / PWA
   │
   ├─ HTTP: lifecycle + WebRTC signaling
   │
   └─ WebRTC
        ├─ video
        └─ bounded typed DataChannel
             │
             ▼
        AppWorker
             │ authenticated local IPC
             ├─ native WebRTC
             └─ Windows Remote App host
                    ├─ PalmTTY-owned Job Object
                    ├─ Job-membership window validation
                    ├─ single-window capture
                    └─ restricted SendInput
                         │
                         ▼
                    Codex / VS Code / ...
~~~

Terminal Session 继续使用独立 Terminal Worker、PTY、xterm snapshot/replay 和 terminal WebSocket。AppWorker 与 Terminal Worker 只共享通用本地 framed-JSON 传输实现，不共享 lifecycle protocol、canonical state 或 recovery generation。

## Workspace / Terminal / App authority

### Workspace

Workspace 持久化：

- name；
- cwd；
- bounded environment；
- 一个 Terminal launch profile；
- 一组 Remote App profile。

创建/修改 Workspace 仍属于“认证 + 精确 Origin”的高权限持久操作。

### Terminal

Terminal profile 持有 Host/WSL runtime、shell argv 和 optional startupCommand。Terminal Session 创建/重启只提交 Workspace ID，Agent 根据持久化 Terminal profile 重新解析并验证。

Git/Files 继续使用 Workspace 的持久化 Terminal runtime 来解释 Host/WSL 路径和命令环境；这不会让 Remote App 继承 WSL runtime。

### Remote App

Remote App profile 只持久化：

- id；
- display name；
- executable；
- 独立 argv。

不再持久化 frameRate/maxWidth/maxHeight。画面大小属于浏览器 presentation state：Remote App Surface 在尺寸、DPR 或横竖屏改变时发送有界 display hint，由 AppWorker/native helper 在协议硬上限内适配。用户界面只显示“画质 · 自动”。

Remote App 是 Windows 宿主 Activity。即使 Workspace 的 Terminal profile 是 WSL，App 仍使用当前 Windows 用户环境启动；因此“Terminal runtime = WSL”不再导致 Remote App profile 被删除或拒绝。

创建 App Session 时浏览器只能发送 workspaceId + profileId，不能临时提交 executable、argv、environment、PID、HWND 或 capture target。

## 应用发现与选择

普通用户不应该手填任意长路径作为主流程。

PalmTTY 提供两个有界选择面：

1. **Detected applications**：检查已知 PATH/常见用户与系统安装目录，再有界读取 Windows App Paths 注册项和开始菜单快捷方式中的本地 `.exe` 目标；按 executable 去重，最多 64 项，手机端可搜索；
2. **Executable browser**：只列目录和 `.exe` 文件，不返回文件内容，也不执行被浏览的程序。

手工 executable 路径保留在“高级”作为兜底。保存 Workspace 与真正启动 App Session 时都会重新解析 executable。

这一能力不是通用文件 API，也不是浏览器任意进程启动 API。

## 生命周期

App Session 采用和终端相似但独立的 durability 原则：

1. Agent 生成 App Session ID、endpoint 和独立 secret；
2. detached 启动 AppWorker；
3. AppWorker 启动 Windows helper；
4. helper 先 suspended 创建应用，再加入自己持有的 `KILL_ON_JOB_CLOSE` Job Object；
5. AppWorker 发布独立 Remote App runtime generation recovery record + secret 并监听本地 IPC；
6. Agent 认证后发送幂等 adopt，adoption 后才进入 durable 生命周期；
7. Agent 重启只断开控制 IPC，不结束 AppWorker/helper/App；
8. AppWorker/helper 控制链路丢失时 Job Object 被关闭，避免孤儿进程；
9. 用户 terminate 时关闭应用树；
10. exited/failed Session 进入有界 retention，可显式 Clear。

PID 仍只用于诊断，不能成为 Agent 任意 kill 进程的 authority。

## 捕获与自动画质

当前 native host 只选择**仍属于 PalmTTY-owned Job Object 的可见顶层窗口**。

捕获源仍有硬限制：

- 源窗口最大 4096×4096；
- 源像素总量有上限；
- AppWorker frame buffer 有硬上限；
- WebRTC/control/SDP/Session 数量都有独立限制。

浏览器发送的 display hint 只能在协议允许的 320×240 ～ 1600×1000 区间内变化；helper 再次 clamp 且强制偶数尺寸。它是 presentation hint，不是授权改变 capture target。

当前 Windows backend 仍使用 `PrintWindow(PW_RENDERFULLCONTENT)`。捕获失败不会退化成 BitBlt/desktop/monitor capture。

媒体状态显式区分：

- `launching`
- `waiting-for-window`
- `waiting-for-frame`
- `streaming`
- `capture-unavailable`

Web 端会把 capture failure 与 WebRTC connectivity failure 分开显示，避免黑屏无诊断。

## ICE / TURN

WebRTC signaling 仍通过 Agent HTTP，并同时要求认证与精确 Origin。

`remoteApps.webrtc.iceServers` 是宿主配置，可声明 bounded STUN/TURN server。能力接口只向已认证用户返回 ICE 配置，并额外指出是否存在 TURN URL。

边界：

- 同 LAN/VPN 可在 host candidate 可路由时保持空列表；
- reverseProxy/公网环境按需配置 STUN/TURN；
- PalmTTY 不提供云 relay；
- TURN credential 属于部署敏感配置；
- TURN 只解决媒体路径，不改变 App capture/input authority。

未来如果提供第一方 relay，必须单独设计隐私、凭据生命周期、流量成本、滥用防护和部署信任边界。

## 输入边界

DataChannel 只接受 typed、有大小上限的：

- absolute pointer；
- relative pointer；
- wheel；
- allowlisted key；
- Unicode text；
- bounded display hint。

display hint 只影响缩放，不产生 OS 输入。

原生 host 在每次 pointer/key/text 注入前重新验证目标窗口 PID 仍属于 PalmTTY Job，并尝试前台激活。Meta/Win、Alt+Tab、Ctrl+Alt 等系统级组合保持受限。PalmTTY 不绕过 UIPI/UAC。

当前没有 clipboard、文件拖放、音频、麦克风、摄像头或任意系统快捷键通道。

## 手机交互

Remote App Surface 有三种模式：

- **查看**：不发送 pointer；
- **直触**：触摸直接映射目标窗口坐标；
- **触控板**：单指相对移动、轻点点击、双指滚动。

文本/IME 独立走 Unicode text control，特殊键走 allowlisted key。

Workbench 顶部可以在同一 Workspace 的 live Terminal/App Activity 间切换；Git/Files 是共享 Workspace Tool；Artifacts 只属于 Terminal Session。切换工具不应卸载当前 Activity。

## 当前限制

- Remote App runtime 只实现 Windows x64；
- 只允许一个媒体 peer，新连接替换旧连接；
- 没有 audio/clipboard/multi-window/full desktop/UAC；
- PrintWindow 对某些 GPU/protected window 可能无画面；
- STUN/TURN 由用户部署配置，PalmTTY 不运营 relay；
- Agent/AppWorker/App 可跨 Agent restart 继续，但不承诺 OS reboot、用户注销或 AppWorker 死亡后的恢复；
- Codex Desktop、VS Code 等具体应用仍需要真实 Windows + 手机验收，不能因为 executable 能启动就宣称兼容。

## 审查重点

以后修改 Remote Apps 时检查：

1. 是否把 Remote App 能力重新塞入 Terminal Worker / terminal WebSocket；
2. Workspace / Terminal / Remote App 三层是否重新混回一个顶层 runtime 配置；
3. 是否允许浏览器创建 Session 时临时指定 executable、argv、environment、PID、HWND；
4. executable discovery 是否扩大成通用文件读取或命令执行；
5. capture target 是否仍可证明属于 AppWorker 持有的 Job Object；
6. 是否出现整桌面 fallback；
7. 是否试图绕过 UIPI/UAC；
8. frame/SDP/DataChannel/display hint/Session 数量是否仍有硬上限；
9. ICE/TURN credential 是否被写入日志、URL 或非认证接口；
10. Agent restart 是否误杀 AppWorker，AppWorker loss 是否遗留孤儿 App；
11. presentation/quality 参数是否错误地重新持久化进 App Profile；
12. clipboard/audio/file channel 是否经过独立 authority/privacy 设计。
