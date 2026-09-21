import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type Locale = "en" | "zh-CN";

const en = {
    "app.eyebrow": "self-hosted remote dev",
    "app.language": "Language",
    "appearance.theme": "Theme",
    "appearance.theme.spectrum": "Spectrum",
    "appearance.theme.obsidian": "Obsidian",
    "appearance.theme.frosted": "Frosted",
    "appearance.performance": "Visual effects",
    "appearance.performance.quality": "Effects",
    "appearance.performance.performance": "Battery saver",
    "appearance.reducedMotion": "The system reduced-motion preference is active. Decorative motion is disabled.",
    "appearance.reducedMotionShort": "Motion reduced",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "auth.connecting": "Connecting…",
    "auth.description": "Enter the access token configured on your workstation.",
    "auth.token": "Access token",
    "auth.signIn": "Sign in",
    "auth.signingIn": "Signing in…",
    "auth.signOut": "Sign out",
    "workspaces.title": "Workspaces",
    "workspaces.add": "Add workspace",
    "workspaces.empty": "No workspaces yet. Add one from this page to start a terminal.",
    "workspaces.newSession": "New session",
    "workspaces.edit": "Edit",
    "workspaces.host": "Host",
    "workspaces.wsl": "WSL",
    "workspaces.defaultShell": "default shell",
    "workspaces.deleteConfirm": "Delete this workspace? Existing exited sessions are not affected; workspaces with an active session cannot be deleted.",
    "sessions.title": "Sessions",
    "sessions.refresh": "Refresh",
    "sessions.empty": "No sessions yet.",
    "sessions.terminate": "Terminate",
    "sessions.terminating": "Terminating…",
    "sessions.terminateTitle": "Terminate session?",
    "sessions.terminateConfirm": "Terminate this running session? This ends the shell and any foreground CLI in it and affects {count} current connection(s).",
    "sessions.clear": "Clear",
    "sessions.clearing": "Clearing…",
    "sessions.clearTitle": "Clear retained session?",
    "sessions.clearConfirm": "Clear this retained session and its terminal history now?",
    "sessions.exitCode": "exit code {code}",
    "sessions.connectionOne": "{count} connection",
    "sessions.connectionOther": "{count} connections",
    "sessions.state.starting": "starting",
    "sessions.state.running": "running",
    "sessions.state.stopping": "stopping",
    "sessions.state.exited": "exited",
    "sessions.state.failed": "failed",
    "workspace.addTitle": "Add workspace",
    "workspace.editTitle": "Edit workspace",
    "workspace.name": "Name",
    "workspace.namePlaceholder": "My project",
    "workspace.cwd": "Working directory",
    "workspace.cwdHostPlaceholder": "C:\\Code\\project or /home/me/project",
    "workspace.cwdWslPlaceholder": "/home/me/project",
    "workspace.cwdBrowseHelp": "Browse directories on the PalmTTY Agent host or selected WSL distribution, not on this browser device.",
    "workspace.directoryBrowse": "Browse",
    "workspace.directoryHide": "Hide browser",
    "workspace.directoryPicker": "Choose a directory",
    "workspace.directoryPickerHelp": "Open a folder to navigate into it, then choose the current folder.",
    "workspace.directoryClose": "Close",
    "workspace.directoryLocations": "Locations",
    "workspace.directoryUp": "Up",
    "workspace.directoryRefresh": "Refresh",
    "workspace.directoryEmpty": "No child directories here.",
    "workspace.directoryTruncated": "Only the first 512 directories are shown.",
    "workspace.directoryUseCurrent": "Use this directory",
    "workspace.directoryLoading": "Loading directories…",
    "workspace.directoryFallback": "The typed path was unavailable, so the browser opened at the default location.",
    "workspace.runtime": "Runtime",
    "workspace.shellProfile": "Shell",
    "workspace.shellProfileHelp": "Installed shells are detected in the selected runtime. Choose Custom only when you need an explicit executable or arguments.",
    "workspace.shellDetecting": "Detecting…",
    "workspace.shellRefresh": "Refresh shells",
    "workspace.shellRecommended": "recommended",
    "workspace.shellCustom": "Custom…",
    "workspace.shellDetectionFailed": "Shell detection failed. You can enter an executable manually.",
    "workspace.shellExecutable": "Shell executable",
    "workspace.shellOptional": "Optional; leave blank to use the runtime default",
    "workspace.shellArgs": "Shell arguments",
    "workspace.shellArgsHelp": "Optional; one argument per line. Arguments are passed directly to the shell executable.",
    "workspace.shellArgsPlaceholder": "-l",
    "workspace.shellHostWindows": "pwsh.exe or another executable",
    "workspace.shellHostUnix": "$SHELL, /bin/bash, /bin/zsh, …",
    "workspace.shellWsl": "/bin/bash, /usr/bin/zsh, …",
    "workspace.environment": "Environment",
    "workspace.environmentHelp": "Optional; one NAME=value entry per line. Values are applied before the shell starts. Workspace environment is stored locally in the PalmTTY workspace catalog, not in a secret vault.",
    "workspace.environmentMissingEquals": "Environment line {line} must use NAME=value.",
    "workspace.environmentInvalidName": "Environment line {line} has an invalid variable name.",
    "workspace.environmentDuplicate": "Environment line {line} duplicates a variable name.",
    "workspace.environmentReserved": "Environment line {line} uses TERM, which PalmTTY manages.",
    "workspace.environmentTooMany": "A workspace can define at most 64 environment variables.",
    "workspace.environmentValueTooLong": "Environment line {line} is too long.",
    "workspace.distribution": "WSL distribution",
    "workspace.distributionOptional": "Optional; leave blank to use the default WSL distribution",
    "workspace.distributionPlaceholder": "Ubuntu-24.04",
    "workspace.startupCommand": "Startup command",
    "workspace.startupOptional": "Optional; each line is sent to the shell after the terminal starts. Use Environment above for variables that must exist before the shell launches.",
    "workspace.startupPlaceholder": "codex",
    "workspace.agentPresets": "Agent presets",
    "workspace.clear": "Clear",
    "workspace.hostHelp": "Runs directly on the PalmTTY Agent host.",
    "workspace.wslHelp": "Runs through wsl.exe. The working directory and shell are Linux paths inside the selected distribution.",
    "workspace.cancel": "Cancel",
    "workspace.save": "Save",
    "workspace.saving": "Saving…",
    "workspace.delete": "Delete",
    "workspace.deleteTitle": "Delete workspace?",
    "workspace.deleting": "Deleting…",
    "terminal.back": "Sessions",
    "terminal.restart": "Restart terminal",
    "terminal.restarting": "Restarting…",
    "terminal.restartTitle": "Restart this terminal?",
    "terminal.restartConfirm": "The current PTY and its retained terminal history will be replaced. The new terminal uses the latest workspace settings and a fresh host environment.",
    "terminal.specialKeys": "Terminal special keys",
    "terminal.composer": "Compose a long command or AI prompt…",
    "terminal.send": "Send",
    "terminal.connection.connecting": "connecting",
    "terminal.connection.connected": "connected",
    "terminal.connection.reconnecting": "reconnecting",
    "terminal.connection.stopping": "stopping",
    "terminal.connection.closed": "closed",
    "terminal.sessionExited": "[PalmTTY] session exited{code}",
    "errors.startup_failed": "PalmTTY could not finish startup.",
    "errors.runtime_capabilities_failed": "Runtime capability detection failed. Host workspaces are still available.",
    "errors.login_failed": "Sign-in failed.",
    "errors.session_create_failed": "Could not create the terminal session.",
    "errors.session_restart_failed": "The terminal could not be restarted.",
    "errors.session_action_failed": "The session action could not be completed.",
    "errors.session_not_stopped": "Stop the session before clearing it.",
    "errors.authentication_required": "Please sign in again.",
    "errors.invalid_credentials": "The access token is incorrect.",
    "errors.too_many_attempts": "Too many sign-in attempts. Try again shortly.",
    "errors.untrusted_origin": "This browser origin is not trusted by the PalmTTY Agent.",
    "errors.too_many_session_requests": "Too many session requests. Try again shortly.",
    "errors.invalid_workspace_request": "The workspace definition is invalid.",
    "errors.workspace_invalid": "The workspace could not be validated on this host.",
    "errors.workspace_not_found": "The workspace no longer exists.",
    "errors.workspace_in_use": "This workspace still has an active session.",
    "errors.too_many_workspace_requests": "Too many workspace changes. Try again shortly.",
    "errors.invalid_directory_request": "The directory browse request is invalid.",
    "errors.directory_unavailable": "That directory cannot be opened from this runtime.",
    "errors.too_many_directory_requests": "Too many directory browse requests. Try again shortly.",
    "errors.invalid_shell_profile_request": "The shell detection request is invalid.",
    "errors.shell_profile_detection_failed": "Installed shells could not be detected.",
    "errors.too_many_shell_profile_requests": "Too many shell detection requests. Try again shortly.",
    "errors.http_401": "Please sign in again.",
    "errors.http_403": "This request was rejected by the security policy.",
    "errors.http_404": "The requested resource was not found.",
    "errors.http_409": "The requested change conflicts with the current state.",
    "errors.http_429": "Too many requests. Try again shortly.",
    "errors.http_500": "The PalmTTY Agent reported an internal error."
} as const;

type MessageKey = keyof typeof en;

const zhCN: Record<MessageKey, string> = {
    "app.eyebrow": "自托管远程开发终端",
    "app.language": "语言",
    "appearance.theme": "主题",
    "appearance.theme.spectrum": "炫彩流光",
    "appearance.theme.obsidian": "黑曜石",
    "appearance.theme.frosted": "白霜",
    "appearance.performance": "视觉效果",
    "appearance.performance.quality": "效果优先",
    "appearance.performance.performance": "性能优先",
    "appearance.reducedMotion": "系统已启用减少动态效果，装饰动画已停止。",
    "appearance.reducedMotionShort": "已减少动态",
    "common.cancel": "取消",
    "common.confirm": "确认",
    "auth.connecting": "正在连接…",
    "auth.description": "请输入工作站上配置的访问令牌。",
    "auth.token": "访问令牌",
    "auth.signIn": "登录",
    "auth.signingIn": "正在登录…",
    "auth.signOut": "退出登录",
    "workspaces.title": "工作区",
    "workspaces.add": "新建工作区",
    "workspaces.empty": "还没有工作区。可直接在网页端新建，然后启动终端。",
    "workspaces.newSession": "新建会话",
    "workspaces.edit": "编辑",
    "workspaces.host": "宿主机",
    "workspaces.wsl": "WSL",
    "workspaces.defaultShell": "默认 Shell",
    "workspaces.deleteConfirm": "确定删除这个工作区吗？已经退出并保留的会话不会受影响；仍有活动会话的工作区不能删除。",
    "sessions.title": "会话",
    "sessions.refresh": "刷新",
    "sessions.empty": "还没有会话。",
    "sessions.terminate": "终止",
    "sessions.terminating": "终止中…",
    "sessions.terminateTitle": "终止会话？",
    "sessions.terminateConfirm": "确定终止这个正在运行的会话吗？这会结束其中的 Shell 和前台 CLI，并影响当前 {count} 个连接。",
    "sessions.clear": "清除",
    "sessions.clearing": "清除中…",
    "sessions.clearTitle": "清除已保留会话？",
    "sessions.clearConfirm": "确定立即清除这个已保留会话及其终端历史吗？",
    "sessions.exitCode": "退出码 {code}",
    "sessions.connectionOne": "{count} 个连接",
    "sessions.connectionOther": "{count} 个连接",
    "sessions.state.starting": "启动中",
    "sessions.state.running": "运行中",
    "sessions.state.stopping": "终止中",
    "sessions.state.exited": "已退出",
    "sessions.state.failed": "失败",
    "workspace.addTitle": "新建工作区",
    "workspace.editTitle": "编辑工作区",
    "workspace.name": "名称",
    "workspace.namePlaceholder": "我的项目",
    "workspace.cwd": "工作目录",
    "workspace.cwdHostPlaceholder": "C:\\Code\\project 或 /home/me/project",
    "workspace.cwdWslPlaceholder": "/home/me/project",
    "workspace.cwdBrowseHelp": "这里浏览的是 PalmTTY Agent 宿主机或所选 WSL 发行版的目录，不是当前手机/浏览器设备的目录。",
    "workspace.directoryBrowse": "选择目录",
    "workspace.directoryHide": "收起目录",
    "workspace.directoryPicker": "选择工作目录",
    "workspace.directoryPickerHelp": "点击子目录继续进入，确认后选择当前目录。",
    "workspace.directoryClose": "关闭",
    "workspace.directoryLocations": "常用位置",
    "workspace.directoryUp": "上一级",
    "workspace.directoryRefresh": "刷新",
    "workspace.directoryEmpty": "当前目录没有可进入的子目录。",
    "workspace.directoryTruncated": "目录过多，仅显示前 512 个。",
    "workspace.directoryUseCurrent": "选择当前目录",
    "workspace.directoryLoading": "正在读取目录…",
    "workspace.directoryFallback": "当前填写的路径不可用，已打开默认位置。",
    "workspace.runtime": "运行环境",
    "workspace.shellProfile": "Shell",
    "workspace.shellProfileHelp": "自动检测所选运行环境里已安装的 Shell；只有需要指定可执行文件或参数时才选择“自定义”。",
    "workspace.shellDetecting": "正在检测…",
    "workspace.shellRefresh": "重新检测",
    "workspace.shellRecommended": "推荐",
    "workspace.shellCustom": "自定义…",
    "workspace.shellDetectionFailed": "Shell 检测失败；仍可手动填写可执行文件。",
    "workspace.shellExecutable": "Shell 可执行文件",
    "workspace.shellOptional": "可选；留空使用该运行环境的默认 Shell",
    "workspace.shellArgs": "Shell 参数",
    "workspace.shellArgsHelp": "可选；每行填写一个参数，并会作为独立 argv 直接传给 Shell。",
    "workspace.shellArgsPlaceholder": "-l",
    "workspace.shellHostWindows": "pwsh.exe 或其他可执行文件",
    "workspace.shellHostUnix": "$SHELL、/bin/bash、/bin/zsh 等",
    "workspace.shellWsl": "/bin/bash、/usr/bin/zsh 等",
    "workspace.environment": "环境变量",
    "workspace.environmentHelp": "可选；每行一个 NAME=value。变量会在 Shell 启动前写入环境。这里的数据保存在 PalmTTY 本机工作区目录中，不是密钥保险箱。",
    "workspace.environmentMissingEquals": "环境变量第 {line} 行必须使用 NAME=value。",
    "workspace.environmentInvalidName": "环境变量第 {line} 行的变量名无效。",
    "workspace.environmentDuplicate": "环境变量第 {line} 行与已有变量名重复。",
    "workspace.environmentReserved": "环境变量第 {line} 行使用了由 PalmTTY 管理的 TERM。",
    "workspace.environmentTooMany": "每个工作区最多定义 64 个环境变量。",
    "workspace.environmentValueTooLong": "环境变量第 {line} 行内容过长。",
    "workspace.distribution": "WSL 发行版",
    "workspace.distributionOptional": "可选；留空使用默认 WSL 发行版",
    "workspace.distributionPlaceholder": "Ubuntu-24.04",
    "workspace.startupCommand": "启动命令",
    "workspace.startupOptional": "可选；终端启动后会逐行发送给 Shell。需要在 Shell 启动前就生效的变量，请使用上面的“环境变量”。",
    "workspace.startupPlaceholder": "codex",
    "workspace.agentPresets": "常用 Agent",
    "workspace.clear": "清空",
    "workspace.hostHelp": "直接在 PalmTTY Agent 所在宿主系统中运行。",
    "workspace.wslHelp": "通过 wsl.exe 运行；工作目录与 Shell 均填写所选发行版内的 Linux 路径。",
    "workspace.cancel": "取消",
    "workspace.save": "保存",
    "workspace.saving": "正在保存…",
    "workspace.delete": "删除",
    "workspace.deleteTitle": "删除工作区？",
    "workspace.deleting": "正在删除…",
    "terminal.back": "会话",
    "terminal.restart": "重启终端",
    "terminal.restarting": "正在重启…",
    "terminal.restartTitle": "重启这个终端？",
    "terminal.restartConfirm": "当前 PTY 和保留的终端历史会被替换；新终端会使用最新工作区设置，并重新读取宿主机环境变量。",
    "terminal.specialKeys": "终端特殊按键",
    "terminal.composer": "输入较长命令或 AI 提示词…",
    "terminal.send": "发送",
    "terminal.connection.connecting": "正在连接",
    "terminal.connection.connected": "已连接",
    "terminal.connection.reconnecting": "正在重连",
    "terminal.connection.stopping": "正在终止",
    "terminal.connection.closed": "已断开",
    "terminal.sessionExited": "[PalmTTY] 会话已退出{code}",
    "errors.startup_failed": "PalmTTY 启动未完成。",
    "errors.runtime_capabilities_failed": "运行环境能力检测失败；仍可创建宿主机工作区。",
    "errors.login_failed": "登录失败。",
    "errors.session_create_failed": "无法创建终端会话。",
    "errors.session_restart_failed": "无法重启终端。",
    "errors.session_action_failed": "无法完成会话操作。",
    "errors.session_not_stopped": "请先终止会话，再清除会话记录。",
    "errors.authentication_required": "请重新登录。",
    "errors.invalid_credentials": "访问令牌不正确。",
    "errors.too_many_attempts": "登录尝试过于频繁，请稍后重试。",
    "errors.untrusted_origin": "当前网页来源未被 PalmTTY Agent 信任。",
    "errors.too_many_session_requests": "会话创建请求过于频繁，请稍后重试。",
    "errors.invalid_workspace_request": "工作区定义无效。",
    "errors.workspace_invalid": "该工作区无法在当前宿主机上通过验证。",
    "errors.workspace_not_found": "该工作区已不存在。",
    "errors.workspace_in_use": "该工作区仍有活动会话。",
    "errors.too_many_workspace_requests": "工作区修改过于频繁，请稍后重试。",
    "errors.invalid_directory_request": "目录浏览请求无效。",
    "errors.directory_unavailable": "当前运行环境无法打开这个目录。",
    "errors.too_many_directory_requests": "目录浏览请求过于频繁，请稍后重试。",
    "errors.invalid_shell_profile_request": "Shell 检测请求无效。",
    "errors.shell_profile_detection_failed": "无法检测当前运行环境中已安装的 Shell。",
    "errors.too_many_shell_profile_requests": "Shell 检测请求过于频繁，请稍后重试。",
    "errors.http_401": "请重新登录。",
    "errors.http_403": "该请求被安全策略拒绝。",
    "errors.http_404": "未找到请求的资源。",
    "errors.http_409": "该修改与当前状态冲突。",
    "errors.http_429": "请求过于频繁，请稍后重试。",
    "errors.http_500": "PalmTTY Agent 发生内部错误。"
};

const messages: Record<Locale, Record<MessageKey, string>> = {
  en,
  "zh-CN": zhCN
};
type Variables = Record<string, string | number>;

function detectLocale(): Locale {
  try {
    const stored = window.localStorage.getItem("palmtty.locale");
    if (stored === "en" || stored === "zh-CN") return stored;
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function interpolate(template: string, variables?: Variables): string {
  if (!variables) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined ? match : String(value);
  });
}

type I18nValue = {
  locale: Locale;
  setLocale(locale: Locale): void;
  t(key: MessageKey, variables?: Variables): string;
  error(code: string): string;
  connections(count: number): string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem("palmtty.locale", locale);
    } catch {
      // Language selection still works for the current page.
    }
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const t = (key: MessageKey, variables?: Variables) =>
      interpolate(messages[locale][key], variables);

    return {
      locale,
      setLocale(next) {
        setLocaleState(next);
      },
      t,
      error(code) {
        const key = `errors.${code}` as MessageKey;
        return key in messages[locale] ? t(key) : code;
      },
      connections(count) {
        return t(
          count === 1
            ? "sessions.connectionOne"
            : "sessions.connectionOther",
          { count }
        );
      }
    };
  }, [locale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
