<!-- bilingual -->
# Autostart / 开机自启

## English

PalmTTY can register the built Agent as a **current-user** background startup entry on Windows and Linux:

~~~text
pnpm build
pnpm autostart install --config <config-path> [--env-file <env-file>]
pnpm autostart status
pnpm autostart restart
pnpm autostart uninstall
~~~

The command records absolute paths to the current Node executable, repository, built Agent and config. Re-run `pnpm autostart install ...` after moving the repository or changing to a Node installation with a different executable path.

### Environment file

`--env-file` is optional. It is useful for the bootstrap token because the secret value stays out of the scheduled-task/systemd command line. The Agent loads strict `NAME=value` entries before it loads PalmTTY config; blank lines and `#` comments are allowed, balanced outer single/double quotes are removed, duplicate/invalid names fail startup, and shell expansion is intentionally not performed.

Start from `examples/palmtty.autostart.env.example`, keep the real file outside the repository, and restrict it to the PalmTTY OS user. Linux installation rejects an env file that is group/world accessible; use `chmod 600`.

### Windows

Windows uses a Task Scheduler **logon trigger** for the current user with `InteractiveToken` and least privilege. This is deliberate: PalmTTY shells, Git credentials, SSH agents, PATH and App Execution Aliases belong to the real workstation user, so PalmTTY does not install itself as LocalSystem.

~~~powershell
pnpm build
New-Item -ItemType Directory -Force "$env:APPDATA\PalmTTY" | Out-Null
Copy-Item examples/palmtty.autostart.env.example "$env:APPDATA\PalmTTY\autostart.env"
# Edit autostart.env and replace the placeholder token.

pnpm autostart install --config "$PWD\palmtty.local.yaml" --env-file "$env:APPDATA\PalmTTY\autostart.env"
pnpm autostart status
~~~

The task starts when that user signs in and is also started immediately by the install command. The Task Scheduler action uses the system Windows PowerShell host with `-WindowStyle Hidden`; PowerShell invokes the built Node Agent synchronously and propagates its exit code, so Task Scheduler keeps supervising the Agent without leaving a persistent Node console window on the desktop. PalmTTY does not currently install a pre-login Windows service. Local policy may restrict Task Scheduler registration. Real Windows release acceptance should still check for any transient desktop flash because CI cannot observe window visibility.

### Linux

Linux uses a `systemd --user` service:

~~~bash
pnpm build
mkdir -p ~/.config/palmtty
cp examples/palmtty.example.yaml ~/.config/palmtty/config.yaml
cp examples/palmtty.autostart.env.example ~/.config/palmtty/autostart.env
chmod 600 ~/.config/palmtty/autostart.env
# Edit ~/.config/palmtty/autostart.env and replace the placeholder token.

pnpm autostart install \
  --config ~/.config/palmtty/config.yaml \
  --env-file ~/.config/palmtty/autostart.env
pnpm autostart status
~~~

The generated user unit uses `Restart=on-failure` and `KillMode=process`. The latter is intentional because the PalmTTY Agent is only the control plane; independent Session Workers must not be killed merely because the Agent service is restarted.

After `pnpm build`, normal `pnpm start` and autostart do **not** run Vite. The Agent serves the compiled Web UI itself on the configured Agent endpoint; with `examples/palmtty.example.yaml` that is `http://127.0.0.1:17688/`. Port `5173` belongs only to `pnpm dev` and exists only while the Vite development server is running. `pnpm autostart status` also prints PalmTTY-owned UTF-8 status fields instead of forwarding localized `schtasks` text.

A normal systemd user manager starts with the user's session. For a headless Linux host that must start the user manager at boot before interactive login, the operator may enable lingering according to host policy, for example `loginctl enable-linger "$USER"`. PalmTTY does not elevate itself or change linger policy automatically.

### Persistence boundary

Autostart restores the **Agent service**, not the old PTY after an OS reboot. Browser disconnect and Agent restart persistence still work through independent Session Workers. An OS reboot/logoff kills the old PTY/Worker; after boot PalmTTY starts cleanly and persisted Workspaces remain available for creating new Sessions.

## 中文

PalmTTY 可以把编译后的 Agent 注册成 Windows/Linux 的**当前用户**后台自启动项：

~~~text
pnpm build
pnpm autostart install --config <配置路径> [--env-file <环境文件>]
pnpm autostart status
pnpm autostart restart
pnpm autostart uninstall
~~~

该命令会记录当前 Node 可执行文件、仓库、已编译 Agent 和配置文件的绝对路径。移动仓库或切换到不同 Node 安装路径后，应重新执行 `pnpm autostart install ...`。

### 环境文件

`--env-file` 可选，适合保存 bootstrap token，因为 secret 的**值**不会进入计划任务/systemd 命令行。Agent 会在读取 PalmTTY 配置前加载严格的 `NAME=value`；允许空行与 `#` 注释，成对最外层单双引号会去除，重复/非法变量名会直接失败，并且不会做 shell 展开。

可以从 `examples/palmtty.autostart.env.example` 复制，真实文件必须放在仓库外并只允许 PalmTTY OS 用户读取。Linux 安装会拒绝 group/world 可读的 env 文件，应使用 `chmod 600`。

### Windows

Windows 使用当前用户的 Task Scheduler **登录触发器**，采用 `InteractiveToken` + 最低权限，不安装 LocalSystem 服务。原因是 PalmTTY 内的 Shell、Git 凭据、SSH Agent、PATH 和 App Execution Alias 都应属于真实开发用户。

~~~powershell
pnpm build
New-Item -ItemType Directory -Force "$env:APPDATA\PalmTTY" | Out-Null
Copy-Item examples/palmtty.autostart.env.example "$env:APPDATA\PalmTTY\autostart.env"
# 编辑 autostart.env，替换 token 占位值。

pnpm autostart install --config "$PWD\palmtty.local.yaml" --env-file "$env:APPDATA\PalmTTY\autostart.env"
pnpm autostart status
~~~

任务会在该用户登录时启动；安装命令也会立即启动一次。Task Scheduler 的 Action 改为使用系统 Windows PowerShell，并带 `-WindowStyle Hidden`；PowerShell 会同步启动编译后的 Node Agent，并把 Agent 退出码传回 Task Scheduler，因此仍保留任务生命周期监督，同时不会在桌面长期挂着一个 Node console 窗口。当前不提供“用户尚未登录就运行”的 Windows Service 模式。某些本机策略可能限制 Task Scheduler 注册。CI 无法观察真实桌面窗口，所以正式 Windows 验收仍应检查是否存在瞬时闪框。

### Linux

Linux 使用 `systemd --user`：

~~~bash
pnpm build
mkdir -p ~/.config/palmtty
cp examples/palmtty.example.yaml ~/.config/palmtty/config.yaml
cp examples/palmtty.autostart.env.example ~/.config/palmtty/autostart.env
chmod 600 ~/.config/palmtty/autostart.env
# 编辑 ~/.config/palmtty/autostart.env，替换 token 占位值。

pnpm autostart install \
  --config ~/.config/palmtty/config.yaml \
  --env-file ~/.config/palmtty/autostart.env
pnpm autostart status
~~~

生成的 user unit 使用 `Restart=on-failure` 与 `KillMode=process`。后者是有意设计：Agent 只是控制面，独立 Session Worker 不应因为 Agent service 重启而被 systemd 一起清理。

`pnpm build` 之后，正常 `pnpm start` 与 autostart **不会**启动 Vite；编译后的 Web UI 由 Agent 自己在配置的 Agent endpoint 提供。使用 `examples/palmtty.example.yaml` 时应打开 `http://127.0.0.1:17688/`。端口 `5173` 只属于 `pnpm dev`，只有 Vite 开发服务器运行期间才存在。`pnpm autostart status` 也会输出 PalmTTY 自己的 UTF-8 状态字段，不再直接转发本地化的 `schtasks` 文本。

普通 systemd user manager 会随用户会话启动。如果无头 Linux 主机要求“尚未交互登录就启动用户 manager”，管理员可按本机策略启用 linger，例如 `loginctl enable-linger "$USER"`。PalmTTY 不会自行提权或修改 linger 策略。

### 持久化边界

自启动恢复的是 **Agent 服务**，不是 OS 重启前的旧 PTY。浏览器断线与“仅 Agent 重启”仍可通过独立 Worker 恢复；OS reboot/用户注销会终止旧 PTY/Worker。重启后 PalmTTY 会干净启动，持久化 Workspace 仍存在，可以创建新的 Session。
