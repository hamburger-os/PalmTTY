# 部署架构

## 部署原则

PalmTTY 提供的是当前 OS 用户的真实开发 Shell，因此部署层必须保持三个边界：

- Agent/Session Worker 默认都以**普通用户**权限运行，不静默提权；
- HTTPS/私有网络只解决外部入口，不能改变 Workspace/PTY 的本机用户权限；
- “Agent 自启动”与“旧 PTY 跨 OS reboot 存活”是两回事。前者已实现，后者仍未实现。

## 本机开发

`pnpm dev` 的默认开发拓扑：

```text
本机浏览器 / 同一私有局域网手机
        │ http://<开发机-LAN-IP>:5173
        ▼
Vite dev server（默认 0.0.0.0:5173）
        │ 本机代理 /api + WebSocket
        ▼
PalmTTY Agent（配置 endpoint；示例为 127.0.0.1:17688）
```

开发启动器只把检测到的 RFC1918、IPv4 link-local 和 100.64/10 私有/overlay 地址对应的 5173 Origin 作为**精确值**临时注入 development Agent，不写回配置、不启用通配 Origin。Windows 若 LAN 访问超时，应按 Private 网络配置防火墙，不由 PalmTTY 自动提权修改。

正常构建运行与 autostart 不包含 Vite：`pnpm build` 后 Agent 直接托管 `apps/web/dist`。网络暴露改为 `server.exposure.mode` 一等模型：`local` 固定 loopback；`lan` 固定 `0.0.0.0` 并自动生成当前私有/overlay IPv4 的精确 HTTP Origin；`reverseProxy` 使用显式 HTTPS Origin 并自动启用 Secure Cookie；`https` 由 Agent 直接加载证书/私钥。示例配置为 `local`，对应 `http://127.0.0.1:17688/`；`http://<LAN-IP>:5173` 只在 `pnpm dev` 运行时存在。

## Windows 当前用户自启动

`pnpm autostart install` 在 Windows 注册 Task Scheduler 登录任务：

- 触发器：当前用户登录；
- LogonType：`InteractiveToken`；
- RunLevel：`LeastPrivilege`；
- 安装阶段：使用系统 Windows PowerShell 5.1 的 `Add-Type -OutputType WindowsApplication` 一次性把 `scripts/windows-autostart-host.cs` 编译为 `%LOCALAPPDATA%\\PalmTTY\\autostart\\palmtty-autostart-host.exe`；运行阶段不依赖 PowerShell；
- Action：Task Scheduler 直接执行上述 GUI-subsystem host，并只传 `--installation <...\\installation.json>`；task XML 不再携带 Node/Agent/config/env-file 等仓库细节；
- native host：读取 installation manifest，用 `CREATE_SUSPENDED | CREATE_NO_WINDOW` 创建 Node Agent，先加入 `KILL_ON_JOB_CLOSE | SILENT_BREAKAWAY_OK` Job Object，再恢复、等待并传递退出码；
- WorkingDirectory、Agent、config 与可选 env-file 都使用安装时的绝对路径；
- 安装会先结束旧任务实例、更新任务定义并立即启动新实例；
- 失败 Agent 由 Task Scheduler 做有限次数重启；Job Object 的 kill-on-close 保证 Task Scheduler `/End` 或包装进程结束时 Agent 也随之退出，不留下占用端口的孤儿控制面；`SILENT_BREAKAWAY_OK` 让 Agent 创建的独立 Session Worker 脱离该 Job，从而继续满足 `Agent lifetime != Worker lifetime`；
- `pnpm autostart status` 通过 `Get-ScheduledTask` / `Get-ScheduledTaskInfo` 生成 UTF-8 JSON，再由 PalmTTY 输出稳定字段，不再直接打印随 Windows 语言/code page 变化的 `schtasks /FO LIST /V` 文本。

不使用 LocalSystem/S4U 的原因是 PalmTTY 的 Shell、Git/SSH credential、PATH、WindowsApps App Execution Alias 都属于真实开发用户。当前不实现“用户未登录时的 Windows Service 模式”。

Windows 登录自启动链路已经彻底去除长期 console host：Task Scheduler 的直接 child 是 PE `Windows GUI` subsystem 的 PalmTTY host；Node 再由该 host 使用 `CREATE_NO_WINDOW` 创建。CI 会实际编译该 host、检查 PE subsystem=GUI、执行 fixture Agent，并验证 Agent 退出码与 detached Worker breakaway；真实桌面仍可作为额外视觉验收，但实现语义不再依赖 `-WindowStyle Hidden`。

## Linux 当前用户自启动

Linux 使用 `systemd --user` service，安装路径为当前用户的 `~/.config/systemd/user/palmtty.service`（或对应 XDG config 目录）。

生成 unit 的关键语义：

- `Restart=on-failure`：只监督 Agent 控制面；
- `KillMode=process`：停止/restart Agent 时只终止主 Agent 进程，不把独立 Session Worker 当普通 service child 一起清理；
- `WantedBy=default.target`：随 user manager 默认目标启用；
- 不使用 root/system service。

普通 user manager 随用户会话出现；无头 Linux 如果要求在交互登录前就启动 user manager，可由管理员按本机策略启用 linger，例如 `loginctl enable-linger <user>`。PalmTTY 不自动修改该系统策略。

## 自启动密钥

Agent 支持 `--env-file <path>`，自启动管理器只把**文件路径**写进 task/unit argv，secret 值本身不进入命令行。

env-file 使用严格 `NAME=value`：

- 空行和 `#` 注释允许；
- 成对最外层单双引号会去掉；
- 不做 shell expansion；
- 重复/非法变量名直接失败；
- Linux autostart 安装要求 env-file 不允许 group/world 访问（通常 `chmod 600`）；
- Windows 由操作者保证文件只对当前用户可读。

示例：`examples/palmtty.autostart.env.example`。

## 路径与升级

自启动定义记录安装时的绝对 Node/仓库/Agent/config 路径。以下变化后必须重新执行 `pnpm build` 与 `pnpm autostart install ...`：

- 仓库被移动；
- Node 安装切换导致 `node` 可执行文件绝对路径变化；
- 自启动参数/config/env-file 路径变化。

原地更新仓库且 Node 路径不变时，重新 build 后可通过 `pnpm autostart restart` 重新加载 Agent。

## 持久化边界

已支持：

- 浏览器断开后 PTY 继续；
- 仅 Agent 进程 restart 后独立 Worker/PTY 继续；
- Windows 登录或 Linux user manager 启动时自动拉起 Agent；
- Workspace catalog 跨 Agent/OS restart 保留。

仍不支持：

- OS reboot 后恢复原 PTY/Worker；
- 用户注销后继续保留旧 PTY；
- Worker 进程自身死亡后的终端恢复。

因此自启动解决的是“机器回来后 PalmTTY 控制面自动可用”，不是 replay 旧进程状态。

## 家庭局域网 / QNAP

推荐拓扑：

```text
手机
  │ HTTPS/WSS
  ▼
域名 / 私有入口
  │
QNAP / Caddy / Tailscale
  │ 内网 HTTP
  ▼
Windows/Linux PalmTTY Agent
```

正常非 loopback 配置必须开启认证、Secure Cookie 与最终 HTTPS Origin allowlist。QNAP/Caddy 只承担 TLS、域名、WebSocket 反代和可选附加认证；真正的 Shell、Codex、Git 与文件留在开发主机。

## 当前不做

- PalmTTY 官方云中继；
- NAT 穿透服务；
- 自动申请公网域名；
- Windows LocalSystem/预登录服务模式；
- 自动修改 Linux linger/系统级 service；
- 把 autostart 描述成 OS reboot PTY persistence。
