# Remote Apps 架构

## 定位

Remote Apps 是 PalmTTY 的第二类交互 Activity，用于从手机远程操作由 PalmTTY 在宿主机上启动的单个桌面应用窗口。它不是 Terminal Session 的扩展，也不是完整 Remote Desktop。

当前第一版只实现 **Windows x64 Host Workspace**：

- 每个 App Session 一个独立 AppWorker；
- AppWorker 与 Terminal Worker 使用不同的 IPC protocol generation 和 runtime 目录；
- 浏览器只按持久化 Workspace 中的 Remote App Profile ID 启动，不能在创建请求里临时提交 executable、argv、PID 或 HWND；
- 原生 helper 只选择自己启动的PalmTTY Job Object 成员进程拥有的可见顶层窗口；
- 画面通过 WebRTC video track 直接传给浏览器，受限输入通过 WebRTC DataChannel 回到 AppWorker；
- Agent 仍只负责认证、Origin、Workspace authority、Session registry 和 signaling。

## 进程与数据面

~~~text
Phone / PWA
   │
   ├─ HTTP: lifecycle + WebRTC signaling
   │
   └─ WebRTC
        ├─ video
        └─ bounded control DataChannel
             │
             ▼
        Remote App Worker
             │ authenticated local IPC
             ├─ native WebRTC
             └─ Windows Remote App host
                    ├─ PalmTTY-owned Job Object
                    ├─ Job-membership window validation
                    ├─ window-only capture
                    └─ restricted SendInput
                         │
                         ▼
                    Codex / VS Code / ...
~~~

Terminal Session 继续使用原来的 Terminal Worker、PTY、xterm snapshot/replay 和 terminal WebSocket。两个 Worker 只共享通用的本地 framed-JSON 传输实现，不共享 lifecycle protocol、canonical state 或 recovery generation。

## Workspace authority

Remote App Profile 是 Workspace 持久配置的一部分，包含 id、显示名称、executable、独立 argv、帧率和最大画面尺寸。Profile 只允许 Host Workspace。创建/修改 Workspace 时会验证 executable；真正创建 App Session 时还会重新解析 Workspace 和 executable，因此保存后的 PATH/宿主环境变化不会绕过启动时验证。

浏览器创建 App Session 只发送 workspaceId + profileId。这个设计与 Terminal Session 只按持久 Workspace 创建的边界一致，避免把 Remote Apps 变成浏览器任意进程启动 API。

## 生命周期

App Session 采用和终端相似但独立的 durability 原则：

1. Agent 生成 App Session ID、endpoint 和独立 secret；
2. detached 启动 AppWorker；
3. AppWorker 启动 Windows helper，helper 先以 suspended 状态创建应用进程，再把它加入 KILL_ON_JOB_CLOSE Job Object；
4. AppWorker 发布 app-runtime-v1 recovery record + secret 并监听本地 IPC；
5. Agent 认证后发送幂等 adopt，只有 adoption 完成后 Session 才进入持久生命周期；
6. Agent 重启只断开控制 IPC，不结束 AppWorker、helper 或应用；
7. AppWorker/控制管道丢失会导致 helper 终止自己持有的 Job Object，避免留下脱离 PalmTTY authority 的孤儿应用；
8. 用户终止 Session 会关闭 helper / Job Object，应用及 PalmTTY 启动的后代随之结束；
9. exited/failed Session 在有界 retention 后由 AppWorker 清理，也可通过“清除”立即 retirement。

和 Terminal Worker 一样，recovery record 中的 PID 只能用于诊断，不能作为 Agent 任意 kill 进程的 authority。

## 捕获边界

当前 Windows native host 还把源窗口限制为最大 4096×4096 且不超过 12 MP，避免在缩放前为异常大窗口分配无界 Bitmap；AppWorker 帧缓冲固定上限 8 MiB，控制通道和 helper stdin backpressure 也有独立上限。

当前 Windows native host 使用 PrintWindow(PW_RENDERFULLCONTENT) 捕获**已验证属于 PalmTTY 启动进程树的单个窗口**，并按 Profile 尺寸上限缩放后送入 AppWorker 的 WebRTC video source。

有意不提供：

- Desktop/Monitor 捕获；
- BitBlt/GDI 整桌面 fallback；
- 浏览器传入 HWND；
- 多窗口选择；
- 后台偷窥任意现有应用。

因此某些 GPU 加速、受保护或不支持 PrintWindow 的窗口可能无法得到有效画面。当前应把这类应用视为未验证，而不是自动降级到更宽权限的桌面捕获。以后如更换 Windows Graphics Capture backend，应保持相同“Worker-owned app → owned window only”的 authority。

## 输入边界

DataChannel 只接受 typed、大小有界的 absolute pointer、relative pointer、wheel、allowlisted keyboard key 和 Unicode text。原生 host 在每次注入前再次验证目标窗口仍属于当前 App 的进程树，并尝试把它带到前台。Meta/Win 键和 Alt+Tab 被拒绝。PalmTTY 不绕过 Windows UIPI；因此低完整性 PalmTTY 无法向 elevated App 注入输入，这是安全边界，不是需要规避的错误。

当前没有 clipboard、文件拖放、音频、摄像头、麦克风或系统级任意快捷键通道。

## 手机交互

Remote App Surface 提供三种显式模式：

- **查看**：不向远端发送 pointer，浏览器保留页面手势与 pinch zoom；
- **直触**：手指直接映射目标窗口坐标；
- **触控板**：单指相对移动、轻点点击、双指滚动。

特殊键和长文本/语音输入独立于画面，长文本走 Unicode text control，不依赖手机键盘生成桌面级 keydown 序列。

WorkspaceWorkbench 现在区分 Activity 和 Workspace Tool：Terminal / Remote App 是 Activity；Git / Files 是 Workspace Tool；Artifacts 仍是 Terminal Session scope。切换到 Git/Files 不卸载当前 Activity，因此终端和 WebRTC 媒体连接都保持。

## 当前限制

- 只支持 Windows x64 Host runtime；WSL Profile 不允许 Remote Apps；
- WebRTC 当前只使用 host candidates，没有 TURN/cloud relay；
- 只允许一个浏览器媒体 peer，新连接会替换旧连接；
- 没有音频、clipboard、多窗口、全桌面、UAC/elevated 控制；
- 当前 window capture backend 对部分 GPU/受保护窗口可能无画面；
- Agent/Worker/App 可以跨 Agent 重启继续，但不承诺 OS reboot、用户注销或 AppWorker 本身死亡后的恢复；
- Codex Desktop、VS Code 等具体应用仍需要真实 Windows + 手机验收，不因为 executable 能启动就宣称其画面/输入已兼容。

## 审查重点

以后修改 Remote Apps 时重点检查：

1. 是否把 Remote App 能力塞回 Terminal Worker / terminal WebSocket；
2. 是否允许浏览器临时指定 executable、PID、HWND 或任意 input payload；
3. capture target 是否仍能证明属于 AppWorker 启动的进程树；
4. 是否出现整桌面 fallback；
5. 是否试图绕过 UIPI/UAC；
6. AppWorker secret 是否泄漏到浏览器、argv、URL、App 环境或日志；
7. frame、SDP、DataChannel、Session 数量和 native pipe 是否仍有硬上限；
8. Agent restart 是否误杀 AppWorker，AppWorker loss 是否会遗留孤儿 App；
9. 新的 clipboard/audio/file channel 是否经过独立 authority 和敏感数据审查。
