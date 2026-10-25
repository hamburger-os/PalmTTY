<!-- bilingual -->
# Autostart / 开机自启

## English

PalmTTY keeps autostart at **current-user** privilege. Installed releases and source checkouts share the same runtime semantics, but the installed path no longer depends on a repository, global Node.js, pnpm, or compiling helper code on the target workstation.

### Installed releases

The normal installed workflow is:

~~~text
palmtty init --install-service
palmtty info
palmtty service status
palmtty service restart
palmtty service uninstall
~~~

`palmtty init` creates the current user's default `config.yaml` and a 256-bit random bootstrap token when those files do not already exist. `--install-service` then registers the background Agent. Upgrades preserve the per-user config, credentials and Workspace catalog.

Windows stores the default config/credentials under `%APPDATA%\PalmTTY`. Linux uses `$XDG_CONFIG_HOME/palmtty` or `~/.config/palmtty`. The credential file is separate from config so the token value never needs to appear in Task Scheduler/systemd command lines.

### Windows installed runtime

The Windows installer is per-user and installs PalmTTY under Local AppData. Release packaging compiles `palmtty-autostart-host.exe` as a **WindowsApplication/GUI-subsystem** binary before publication; the target workstation does not compile C# or require PowerShell for the long-lived runtime chain.

The current-user Task Scheduler entry uses:

- a logon trigger for the real PalmTTY user;
- `InteractiveToken` and `LeastPrivilege`;
- the release-packaged GUI host as its direct action;
- the bundled Node runtime and installed Agent path from a small per-user installation manifest.

The GUI host creates the Agent with `CREATE_SUSPENDED | CREATE_NO_WINDOW`, assigns it to a `KILL_ON_JOB_CLOSE | SILENT_BREAKAWAY_OK` Job Object, then resumes and supervises it. Stopping/restarting the task stops the Agent control plane without leaving a console, while independent Session Workers may break away and keep their separate lifetime. PalmTTY does not install a LocalSystem or pre-login Windows service.

The installer stops/removes the old task before replacing program files, installs the new runtime, then reinitializes the same current-user service. User configuration and Workspace data are not stored under the application directory.

### Linux installed runtime

After installing the Debian package, initialize PalmTTY as the intended desktop/server user:

~~~bash
palmtty init --install-service
palmtty service status
~~~

The Debian package installs the immutable application runtime under `/usr/lib/palmtty` and the command at `/usr/bin/palmtty`; it intentionally does **not** create a root/system Agent service. `palmtty service install` creates the current user's `systemd --user` unit.

The unit uses `Restart=on-failure` and `KillMode=process`. The latter is required because the Agent is a replaceable control plane; independent Session Workers must not be killed merely because the service is restarted.

For a headless host that needs the user manager before interactive login, an administrator may explicitly enable lingering according to local policy, for example `loginctl enable-linger "$USER"`. PalmTTY never enables linger or elevates itself automatically.

### Portable archives

Portable Windows/Linux archives contain the same self-contained runtime. Run the CLI from the extracted `bin` directory, then use `palmtty init --install-service` if you want the extracted copy to become the user's startup target. Moving/deleting that extracted directory later requires reinstalling/uninstalling the service because the service intentionally records absolute installed-runtime paths.

### Source checkout

Contributor/source workflows remain available:

~~~text
pnpm build
pnpm autostart install --config <config-path> [--env-file <env-file>]
pnpm autostart status
pnpm autostart restart
pnpm autostart uninstall
~~~

This path is for development and repository validation. It may compile the Windows helper from source and records absolute repository/Node paths, so moving the checkout or changing Node installations requires reinstalling the source autostart entry. Normal users should prefer packaged releases.

### Persistence boundary

Autostart restores the **Agent service**, not the old PTY after an OS reboot. Browser disconnect and Agent-only restart persistence continue through independent Session Workers. OS reboot/logoff terminates the old Worker/PTY; after boot PalmTTY starts cleanly and persisted Workspaces remain available for new Sessions.

## 中文

PalmTTY 的自启动始终保持在**当前用户权限**。安装版和源码版使用相同的 Agent/Worker 生命周期语义，但安装版不再依赖源码仓库、全局 Node.js、pnpm，也不会要求目标机器在安装时编译辅助程序。

### 安装版

正常使用路径：

~~~text
palmtty init --install-service
palmtty info
palmtty service status
palmtty service restart
palmtty service uninstall
~~~

`palmtty init` 会在不存在时创建当前用户默认 `config.yaml`，并生成 256-bit 随机 bootstrap token；加上 `--install-service` 后会继续注册后台 Agent。升级只替换程序文件，不覆盖用户配置、凭据和 Workspace catalog。

Windows 默认把配置/凭据放在 `%APPDATA%\PalmTTY`；Linux 使用 `$XDG_CONFIG_HOME/palmtty` 或 `~/.config/palmtty`。凭据文件与 config 分离，token 值不会进入 Task Scheduler/systemd 命令行。

### Windows 安装版

Windows 安装器按当前用户安装到 Local AppData。Release 构建阶段会提前把 `palmtty-autostart-host.exe` 编译并验证为 **WindowsApplication/GUI 子系统**程序；目标机器不再编译 C#，长期运行链路也不依赖 PowerShell。

Task Scheduler 继续使用真实 PalmTTY 用户的登录触发器、`InteractiveToken` 与 `LeastPrivilege`。计划任务直接启动发行包中的 GUI host；host 根据 per-user installation manifest 启动发行包自带的 Node runtime 和 Agent。

GUI host 使用 `CREATE_SUSPENDED | CREATE_NO_WINDOW` 创建 Agent，在恢复前加入 `KILL_ON_JOB_CLOSE | SILENT_BREAKAWAY_OK` Job Object，然后监督 Agent。停止/重启任务会停止控制面且不留下 console；独立 Session Worker 可以 break away，继续保持与 Agent 不同的生命周期。PalmTTY 不安装 LocalSystem 或预登录 Windows Service。

升级安装时会先停止/移除旧任务，再替换程序文件，最后重新初始化同一当前用户服务；用户数据不放在程序目录中。

### Linux 安装版

安装 `.deb` 后，以真正运行 PalmTTY 的用户执行：

~~~bash
palmtty init --install-service
palmtty service status
~~~

Debian 包把不可变程序运行时放在 `/usr/lib/palmtty`，命令放在 `/usr/bin/palmtty`；包安装阶段不会创建 root/system Agent 服务。`palmtty service install` 才会为当前用户创建 `systemd --user` unit。

unit 使用 `Restart=on-failure` 与 `KillMode=process`。这是架构要求：Agent 只是可替换控制面，独立 Session Worker 不应因为 service restart 被 systemd 一起清理。

无头主机如果要求 user manager 在交互登录前启动，应由管理员按本机策略显式开启 linger，例如 `loginctl enable-linger "$USER"`。PalmTTY 不会自动提权或修改 linger。

### Portable 包

Windows/Linux portable 包包含同一套自包含运行时。从解压目录的 `bin` 使用 CLI；如果希望该副本变成登录自启动目标，再执行 `palmtty init --install-service`。之后如果移动/删除解压目录，需要重新安装/卸载 service，因为 service 有意记录稳定的绝对程序路径。

### 源码仓库

开发者仍可使用：

~~~text
pnpm build
pnpm autostart install --config <配置路径> [--env-file <环境文件>]
pnpm autostart status
pnpm autostart restart
pnpm autostart uninstall
~~~

这是开发/仓库验证路径，Windows 下仍可能从源码编译 helper，并记录仓库与 Node 的绝对路径；移动仓库或更换 Node 安装后要重新注册。普通用户应优先使用发行包。

### 持久化边界

自启动恢复的是 **Agent 服务**，不是 OS 重启前的旧 PTY。浏览器断线与“仅 Agent 重启”仍通过独立 Worker 保持；OS reboot/用户注销会终止旧 Worker/PTY。机器回来后 Agent 会干净启动，持久化 Workspace 仍可用于创建新 Session。
