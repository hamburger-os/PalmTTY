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
   ├─ launch: win32/executable | packaged/AUMID+package family
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

创建/修改 Workspace 仍属于“认证 + 精确 Origin”的高权限持久操作。当前 typed launch catalog 使用 `workspaces-v3.json`，故意不读取旧的 v1/v2 文件，用户需重新创建 Workspace。

### Terminal

Terminal profile 持有 Host/WSL runtime、shell argv 和 optional startupCommand。Terminal Session 创建/重启只提交 Workspace ID，Agent 根据持久化 Terminal profile 重新解析并验证。

Git/Files 继续使用 Workspace 的持久化 Terminal runtime 来解释 Host/WSL 路径和命令环境；这不会让 Remote App 继承 WSL runtime。

### Remote App

Remote App profile 只持久化：

- id；
- display name；
- typed launch：Win32 executable 或已注册 MSIX 的 AUMID + package family；
- 独立 argv。

不再持久化 frameRate/maxWidth/maxHeight。画面大小属于浏览器 presentation state：Remote App Surface 在尺寸、DPR 或横竖屏改变时发送有界 display hint，由 AppWorker/native helper 在协议硬上限内适配。用户界面只显示“画质 · 自动”。

Remote App 是 Windows 宿主 Activity。即使 Workspace 的 Terminal profile 是 WSL，App 仍使用当前 Windows 用户环境启动；因此“Terminal runtime = WSL”不再导致 Remote App profile 被删除或拒绝。

创建 App Session 时浏览器只能发送 workspaceId + profileId，不能临时提交 executable、argv、environment、PID、HWND 或 capture target。

## 应用发现与选择

普通用户不应该手填任意长路径作为主流程。

PalmTTY 提供两个有界选择面：

1. **Detected applications**：优先枚举当前用户 Get-StartApps 中可与 Get-AppxPackage 注册匹配的 MSIX/AUMID；再检查已知 PATH/常见安装目录、App Paths 和有界开始菜单快捷方式，按 launch identity 去重，总数最多 64 项，手机端可搜索；
2. **Executable browser**：只列目录和 `.exe` 文件，不返回文件内容，也不执行被浏览的程序。

手工 executable 路径保留在“高级”作为兜底。保存 Workspace 与真正启动 App Session 时都会重新验证 typed launch identity；MSIX 不通过 WindowsApps 受保护路径直接执行 EXE。

这一能力不是通用文件 API，也不是浏览器任意进程启动 API。

## 生命周期

App Session 采用和终端相似但独立的 durability 原则：

1. Agent 生成 App Session ID、endpoint 和独立 secret；
2. detached 启动 AppWorker；
3. AppWorker 启动 Windows helper；
4. Win32 helper 先 suspended 创建应用再加入 `KILL_ON_JOB_CLOSE` Job；MSIX helper 通过 IApplicationActivationManager 激活 AUMID，确认全新 PID、包身份与 Job 归属，已有单实例或拒绝 Job 加入的应用直接拒绝接管；
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
- AppWorker 使用有界单次分配的 PTF1 帧解析器，避免 stdout 分片反复拷贝大帧；
- WebRTC/control/SDP/Session 数量都有独立限制。

浏览器发送的 display hint 只能在协议允许的 320×240 ～ 1600×1000 区间内变化；helper 再次 clamp 且强制偶数尺寸。它是 presentation hint，不是授权改变 capture target。

当前 Windows backend 先使用 `PrintWindow(PW_RENDERFULLCONTENT)`，如果失败或得到纯黑空帧，则只对同一个已验证归属的 HWND 重试普通 `PrintWindow`；区分窗口未找到、太大、PrintWindow 失败、空帧、捕获异常等原因。捕获失败不会退化成 BitBlt/desktop/monitor capture。

媒体状态显式区分：

- `launching`
- `waiting-for-window`
- `waiting-for-frame`
- `streaming`
- `capture-unavailable`

Web 端分别管理原生捕获状态、AppWorker 收到帧/成功提交帧/转换失败计数、浏览器实际已解码首帧状态。首帧前可在空画面区域显示等待/失败信息；收到首帧后即使 Worker 的轮询状态暂时仍是等待，也不能覆盖正常视频。后续连接重建、卡帧和捕获异常以 Dock 内不遮挡画面的提示表示。媒体诊断计数收纳到按需展开的工具菜单；浏览器禁止自动播放时保留明确的手动重播动作。

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

## 本轮启动、画面和手机布局调整

Windows Host 的启动阶段为 `validate-profile → create-job → activate-msix/create-win32 → assign-job → resume-process → ready`；失败时以有限长度输出阶段、异常类型和 HRESULT。原生 WebRTC 在 Host READY 后才加载，避免激活失败又触发 native teardown 崩溃。MSIX 包身份尚未验证时禁止终止所返回 PID；系统复用单实例或拒绝 Job 归属仍严格拒绝接管。

手机客户端以画面和当前 VisualViewport 为主，顶部工作区导航收成一行，工具菜单按需显示 Git/文件。根布局把普通页面 section 的留白限定在首页；沉浸模式同时隐藏标题栏和移除对应 Grid 行，保证绝对定位的活动内容仍占满唯一可用行。操作模式、常驻沉浸切换和按需工具/媒体诊断位于视频外的紧凑底部控制条，快捷键栏紧随其后，整个 Dock 不能越过 Safari 安全区域。移除独立「铺满画面」：未适配时保留完整等比画面，用户选择「适应手机」后才有界调整受控 Windows 窗口；修正 DWM 隐形边框造成的外框与采集范围尺寸差，剩余不超过 4% 的微小比例误差自动等比填满，超出则保留完整画面避免隐藏菜单。所有直触、触控板和鼠标绘制统一使用视频实际内容区域及相同显示策略；不增加权限/API。触控板由独立状态机管理单指相对移动、轻点及双指中心滚动，取消手势不发送误点击；仅远程控制模式使用原生非被动 touchmove 抑制浏览器滚动。

浏览器 display hint 继续按同一比例因子缩放宽高；显式 `adaptWindow` 只可尝试调整当前 Job-owned HWND 的尺寸，关闭或 Helper 退出时恢复原尺寸，不得选择其他窗口或桌面。深色 UI 在两种 PrintWindow 模式下均为黑色时标记诊断歧义并继续发送帧；不能把颜色采样当成确定的捕获失败。Windows Graphics Capture 仍未完成独立的真实设备安全验收。

## Windows 原生 Host 更新

已安装版本始终使用与发行包一起构建的 `bin/palmtty-remote-app-host.exe`。源码模式按 Windows Host C# 源码内容及编译参数计算 SHA-256 指纹，编译到当前用户私有 runtime 下带指纹的独立 EXE。源码更新后重新启动 Agent 并打开新的 App Session 会自动重新编译新 Helper，旧的独立 AppWorker 不因源码更新被强行中断。编译使用与指纹相同的临时源码快照，并以原子重命名发布；失败后下次创建 App Session 可重试，不会继续静默复用旧固定名称的 Host。

## 当前限制

- Remote App runtime 只实现 Windows x64；
- 只允许一个媒体 peer，新连接替换旧连接；
- 没有 audio/clipboard/multi-window/full desktop/UAC；
- PrintWindow 对某些 GPU/protected window 仍可能无画面；尚未声称支持 WGC；
- MSIX 激活可能复用已运行的单实例或无法加入 Job，均拒绝接管并保留可诊断错误；
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

## 真实鼠标与输入反馈

原生 Host 仅采样当前 Job-owned HWND 内部的鼠标位置，发送 0–1000000 定点归一化坐标；窗口外发送隐藏状态，不传桌面全局坐标或其他窗口内容。AppWorker 严格解析有界 stderr 记录，只经当前已认证的单一 WebRTC DataChannel 发送有类型的 cursor/inputState 消息，缓冲超限即丢弃，Peer 重建后补发最新状态。手机用相同 contain/cover 几何逆映射绘制主题 SVG 光标，裁切区域外隐藏。

触控板单指移动、轻点左键、长按拖动、双指轻点右键和双指中心滚动。取消、切换模式须释放已经按下的左键且不得补发点击。控制通道未就绪与 Windows 前台/UIPI 输入被拒绝分别提示；不增加任何提权或任意桌面控制路径。「适应手机」继续只调整当前已验证应用窗口。

## 低延迟光标与底部文本入口

最底部特殊键栏与 CLI 复用共享「键盘、长文本」前两项，其后仍是 Ctrl/Alt/Shift 等功能键。「键盘」在真实触控回调中同步聚焦独立的移动端即时输入框，待中文输入法完成组合后发送有界 Unicode，导航编辑键使用原有白名单。「长文本」保留原来的有界 Unicode/IME/粘贴/语音输入与明确发送。即时输入发送失败时保留草稿，关闭时转入长文本面板；选项菜单不重复放置输入入口。鼠标 SVG 保留相同的路径与命中热点，但实际 CSS 尺寸缩至约 5.667×8（上版 17×24 的三分之一），继续消费主题填充/描边令牌。

Windows Host 用独立约 30Hz 线程对当前已验证的 Job-owned HWND 重新校验窗口可见性、归属和实际尺寸后采样光标，而不是等视频 PrintWindow / 编码；窗口外立即隐藏，重复位置限流。常见已前台的受控窗口不再为每次鼠标位移重复执行 ShowWindow/跨线程激活，但不改变现有 Job/UIPI/前台输入权限边界。手机端在 requestAnimationFrame 中合并相对鼠标位移，指针用轻量 DOM transform 显示本地预测，不再为每条坐标遥测触发 React rerender；抬手后短时等待新采样，再与最新原生坐标校准，重连、切模式、离开受控窗口会清理预测/待发送移动。绝不把预测位置当成 Windows 输入成功凭据，真实网络/系统延迟仍需 iPhone Safari + Windows 真机验收。

## 适应手机边缘填充（真机反馈）

实测“适应手机”调整 PC 窗口后仍有左右极窄空隙，手动“铺满画面”只能裁掉这部分；不应再要求用户执行第二个相关操作。Web 移除独立裁切菜单和 `fit` 手动状态，未适配时固定完整 `contain`；已启用适配且收到的实际视频比例与视频内容框差异不超过 4% 时自动 `cover`，并移除该状态下表面外层 1px 装饰边框。若窗口最小尺寸/比例受限导致误差过大，则仍完整显示并在选项中说明，避免宣称无法保证的无损铺满。Windows 使用 DWM extended frame 而非 `GetWindowRect` 作为采集范围，调整外层 HWND 时有界补偿两者差异（单轴最多 32px），仅更改同一 Job-owned HWND。所有坐标投影和显示尺寸提示基于视频实际内容框，杜绝装饰 border 带来的 1px 偏移；同一个自动 fit 同时驱动视频、直触、触控板和可视鼠标。质量与移动端响应链路保持不变。
