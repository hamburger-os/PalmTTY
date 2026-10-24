# Agent 服务端

## 目标

PalmTTY Agent 是工作站上的 Web/API 控制面，负责：

- HTTP/WebSocket API、登录认证与精确 Origin；
- 当前用户的持久 Workspace catalog；
- Files/Git/Artifacts 独立 HTTP API；
- terminal WebSocket proxy；
- 编译后的手机 PWA 静态资源。


## 资源模型

Workspace 持久定义明确分层：

~~~text
Workspace
├─ name / cwd / bounded environment
├─ terminal
│  ├─ runtime (Host / WSL)
│  └─ optional startupCommand
   ├─ id / name
   ├─ executable
   └─ argv
~~~

旧的 Workspace 顶层 `runtime/startupCommand` 不保留兼容层。


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
        │ authenticated local IPC
        ├────────────────────┐
        ▼                    ▼
 ├─ headless xterm       └─ Windows app host
 └─ seq/replay                 └─ owned Job/window
~~~


## Workspace inspection surfaces

### 工作目录与 Terminal Profile

目录浏览只返回目录，不返回文件内容；Host/WSL 都有数量、输出和超时上限。Terminal Profile discovery 只探测已知 Host shell 与已注册 WSL distribution，不通过扫描动作执行用户命令。

## 独立 Web 服务入口

Agent 只在认证之后返回配置中的 VS Code Web/Harness 外部 URL，不执行 HTTP 代理、不创建或停止第三方服务进程。两类链接由服务器运营者明确配置并禁止包含连接令牌、账号密码、查询字符串或片段。

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


## 安全边界

- Agent/Worker/App 默认普通用户运行，不静默提权；
- capture failure 不允许 desktop/monitor fallback；
- 不绕过 Windows UIPI/UAC；
- 所有 message/frame/list/session/backpressure 都必须有硬上限。


## 审查重点

1. PTY/xterm/replay 或 App capture/media canonical state 是否被重新放回 Agent；
2. Agent shutdown 是否误杀 durable Worker；
4. create API 是否重新允许一次性 runtime/executable/env 权限；
5. discovery 是否扩大成通用文件读取/命令执行；
6. secret 是否进入浏览器/日志/argv/env；
7. PID 是否被当成 kill authority；
9. ICE/TURN 配置是否绕过认证或泄漏 credential；
10. buffer/session/backpressure 是否仍有硬限制。

## 可选本地语音服务（2026-10-20）

Agent 新增隔离的 Qwen3-TTS 语音代理，只访问固定的 `127.0.0.1` 端口，不在 Agent 或终端 Worker 中加载 PyTorch。运营者显式设置 `speech.qwen.enabled` 与 `port`、通过私有环境提供独立随机 `PALMTTY_QWEN_TOKEN`，并自行启动独立 Python sidecar。未启用时不需要 Python、GPU 或模型文件，不改变现有安装启动路径。启用后仅提供只读就绪状态和受保护的有界文字片段→WAV 合成，不提供任意命令/模型管理能力。sidecar 可随 Agent 重启独立存活；不承诺 OS 重启自动恢复，部署方需要单独管理其生命周期。
