# Agent 服务端

## 目标

PalmTTY Agent 是工作站上的 Web/API 控制面，负责：

- HTTP/WebSocket API、登录认证与精确 Origin；
- 当前用户的持久 Workspace catalog；
- Workspace/Terminal/Remote App 启动目标验证；
- 有界目录、Terminal Profile、Remote App executable discovery；
- Files/Git/Artifacts 独立 HTTP API；
- Terminal Worker / AppWorker registry、认证、rediscovery 与 lifecycle；
- terminal WebSocket proxy；
- Remote App WebRTC signaling；
- 编译后的手机 PWA 静态资源。

Agent 不拥有 PTY、headless xterm 或 Remote App capture/media canonical state。

## 资源模型

Workspace 持久定义明确分层：

~~~text
Workspace
├─ name / cwd / bounded environment
├─ terminal
│  ├─ runtime (Host / WSL)
│  └─ optional startupCommand
└─ remoteApps[]
   ├─ id / name
   ├─ executable
   └─ argv
~~~

旧的 Workspace 顶层 `runtime/startupCommand` 不保留兼容层。

Terminal Session 创建/重启只接收 Workspace ID；App Session 创建只接收 Workspace ID + saved profile ID。两者都不能通过一次请求临时注入 executable/runtime/env authority。

## 当前数据面

~~~text
Browser
  │ HTTPS / WSS
  ▼
PalmTTY Agent
  ├─ Auth / Origin
  ├─ Workspace Store
  ├─ bounded discovery + Files/Git/Artifacts
  ├─ Terminal/App registries
  ├─ terminal WebSocket proxy
  └─ Remote App signaling
        │ authenticated local IPC
        ├────────────────────┐
        ▼                    ▼
 Terminal Worker          AppWorker
 ├─ PTY                  ├─ WebRTC peer
 ├─ headless xterm       └─ Windows app host
 └─ seq/replay                 └─ owned Job/window
~~~

Terminal 与 Remote App 使用不同 Worker protocol、runtime generation、secret 与 canonical state。共享通用 local framed-JSON utility 不代表协议合并。

## Workspace inspection surfaces

### 工作目录与 Terminal Profile

目录浏览只返回目录，不返回文件内容；Host/WSL 都有数量、输出和超时上限。Terminal Profile discovery 只探测已知 Host shell 与已注册 WSL distribution，不通过扫描动作执行用户命令。

### Remote App executable discovery

Remote App discovery 也是单独的“认证 + 精确 Origin + 限流”能力：

- known-app detection 只检查少量已知开发应用；
- executable browser 只返回目录与 `.exe`；
- 不返回文件内容；
- 不执行被浏览程序；
- 不接受任意命令。

Web 的正常流程优先“检测/选择应用”，手工 executable 路径只作为 Advanced fallback。

## Terminal runtime

Agent preflight 只验证全局认证/暴露/TCP 配置，不遍历 Workspace。

Terminal Session 创建/重启时：

1. 按 Workspace ID 读取最新定义；
2. 读取 `workspace.terminal`；
3. 重新验证 cwd/runtime/shell；
4. Windows Host 重新读取 Machine/User environment 与 PATH，再应用 Workspace environment；
5. WSL 把 distribution/cwd/shell/args 作为结构化 argv，并通过 `WSLENV` 转发允许的 Workspace 变量名；
6. 清除 PalmTTY 控制/认证环境；
7. 生成 Session ID/endpoint/secret；
8. detached 启动 Terminal Worker；
9. authenticated、幂等 `adopt` 成功后才提交 durable lifecycle。

READY 本身不代表 durable；从未 adopt 的 Worker 由创建租约自清理。

## Terminal Worker 生命周期

- 浏览器断线不终止 PTY；
- Agent restart 不终止已 adopt Worker；
- replacement Agent 使用 recovery record + private secret 重新认证；
- PID 只是诊断，不是 kill authority；
- IPC 暂时不可达不能直接删除可能仍存活的 recovery capability；
- terminate / retained-session retirement 都经过 authenticated IPC；
- restart 会 retire 旧 Session，并按最新 `workspace.terminal` 创建新 Session ID。

登录 Cookie 仍是 Agent 内存状态，所以 Agent restart 后需要重新登录。

## Workspace tools

Files/Git/Artifacts 与 terminal WebSocket 分离：

- Files 只读、canonical/symlink containment、有界 preview/export/image read；
- Git 以包含 Workspace cwd 的 repository 为 scope，读取有界；写操作只接受 typed contract，并要求 state/trust/snapshot 约束；
- Artifacts 写入 Workspace 外的 Session 私有 runtime store，受图片签名/尺寸/数量/总量限制，可把本地路径插入 Terminal，但不自动 Enter。

Git/Files 使用 Workspace 的 persisted Terminal runtime 来解释 Host/WSL 路径。这个事实不让 Remote App 继承 WSL runtime。

## Remote App 控制面

Remote Apps 使用独立 App Session 数据面。

创建 App Session 时 Agent：

1. 读取 Workspace + saved profile；
2. 使用 Windows host environment 解析 profile executable；
3. Workspace 的 Terminal 即使是 WSL，也不阻止 Windows Remote App；
4. 清除 PalmTTY 控制/认证环境；
5. 生成独立 App Session ID/endpoint/secret；
6. detached 启动 AppWorker；
7. authenticated adoption 后提交 lifecycle。

AppWorker protocol 当前为 v2，对应独立 `app-runtime-v2` recovery generation。

Windows helper：

- suspended 创建 App；
- 加入 `KILL_ON_JOB_CLOSE` Job Object 后 resume；
- 只发现 Job member process 拥有的可见顶层窗口；
- 只做单窗口 capture；
- restricted input 每次重新验证 ownership；
- AppWorker/helper control 丢失时关闭 Job，避免 orphan。

capture/media state 会以结构化状态回到 Agent/Web：launching、waiting-for-window、waiting-for-frame、streaming、capture-unavailable。

## Remote App presentation 与 ICE

Remote App Profile 不再保存 FPS/width/height。

手机 Surface 通过 typed DataChannel 发送 bounded display hint，helper 在 320×240～1600×1000 presentation envelope 内 clamp 并继续遵守 native source/frame 硬上限。display hint 不允许改变 HWND/capture authority。

`remoteApps.webrtc.iceServers` 提供 bounded STUN/TURN host config：

- capability endpoint 只对已认证用户返回；
- 额外返回 relayConfigured；
- 空列表适用于可直接路由的 LAN/VPN；
- reverse proxy / Internet 环境可按需配置 TURN；
- PalmTTY 本身不运营 relay。

## 安全边界

- Agent/Worker/App 默认普通用户运行，不静默提权；
- Remote App create/signaling 不接受临时 executable/argv/env/PID/HWND；
- capture failure 不允许 desktop/monitor fallback；
- 不绕过 Windows UIPI/UAC；
- Worker/AppWorker secret 不进入浏览器、argv、URL、正常日志或 workload 环境；
- 默认日志不包含 terminal I/O、Remote App text/DataChannel payload/video frame、token、secret 或 Workspace env；
- 所有 message/frame/list/session/backpressure 都必须有硬上限。

详细 Remote App authority 见 [remote-apps.md](remote-apps.md)，安全审查见 [security.md](security.md)。

## 审查重点

1. PTY/xterm/replay 或 App capture/media canonical state 是否被重新放回 Agent；
2. Agent shutdown 是否误杀 durable Worker；
3. Workspace / Terminal / Remote App 三层 authority 是否重新混淆；
4. create API 是否重新允许一次性 runtime/executable/env 权限；
5. discovery 是否扩大成通用文件读取/命令执行；
6. secret 是否进入浏览器/日志/argv/env；
7. PID 是否被当成 kill authority；
8. Remote App capture 是否出现 desktop fallback；
9. ICE/TURN 配置是否绕过认证或泄漏 credential；
10. buffer/session/backpressure 是否仍有硬限制。
