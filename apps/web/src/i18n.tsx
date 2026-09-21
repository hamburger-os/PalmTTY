import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type Locale = "en" | "zh-CN";

const messages = {
  en: {
    "app.eyebrow": "self-hosted remote dev",
    "app.language": "Language",
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
    "workspaces.deleteConfirm": "Delete this workspace? Existing terminal sessions are not affected, but a workspace with a retained session cannot be deleted.",
    "sessions.title": "Sessions",
    "sessions.refresh": "Refresh",
    "sessions.empty": "No sessions yet.",
    "sessions.terminate": "Terminate session",
    "sessions.connectionOne": "{count} connection",
    "sessions.connectionOther": "{count} connections",
    "sessions.state.starting": "starting",
    "sessions.state.running": "running",
    "sessions.state.exited": "exited",
    "sessions.state.failed": "failed",
    "workspace.addTitle": "Add workspace",
    "workspace.editTitle": "Edit workspace",
    "workspace.name": "Name",
    "workspace.namePlaceholder": "My project",
    "workspace.cwd": "Working directory",
    "workspace.cwdHostPlaceholder": "C:\\Code\\project or /home/me/project",
    "workspace.cwdWslPlaceholder": "/home/me/project",
    "workspace.runtime": "Runtime",
    "workspace.shell": "Shell",
    "workspace.shellOptional": "Optional; leave blank to use the runtime default",
    "workspace.shellHostWindows": "pwsh.exe (default) or another executable",
    "workspace.shellHostUnix": "$SHELL / /bin/sh by default",
    "workspace.shellWsl": "/bin/bash, /usr/bin/zsh, …",
    "workspace.distribution": "WSL distribution",
    "workspace.distributionOptional": "Optional; leave blank to use the default WSL distribution",
    "workspace.distributionPlaceholder": "Ubuntu-24.04",
    "workspace.startupCommand": "Startup command",
    "workspace.startupOptional": "Optional; sent to the terminal after it starts",
    "workspace.startupPlaceholder": "codex",
    "workspace.hostHelp": "Runs directly on the PalmTTY Agent host.",
    "workspace.wslHelp": "Runs through wsl.exe. The working directory and shell are Linux paths inside the selected distribution.",
    "workspace.cancel": "Cancel",
    "workspace.save": "Save",
    "workspace.saving": "Saving…",
    "workspace.delete": "Delete",
    "workspace.deleting": "Deleting…",
    "terminal.back": "Sessions",
    "terminal.specialKeys": "Terminal special keys",
    "terminal.composer": "Compose a long command or AI prompt…",
    "terminal.send": "Send",
    "terminal.connection.connecting": "connecting",
    "terminal.connection.connected": "connected",
    "terminal.connection.reconnecting": "reconnecting",
    "terminal.connection.closed": "closed",
    "terminal.sessionExited": "[PalmTTY] session exited{code}",
    "errors.startup_failed": "PalmTTY could not finish startup.",
    "errors.login_failed": "Sign-in failed.",
    "errors.session_create_failed": "Could not create the terminal session.",
    "errors.authentication_required": "Please sign in again.",
    "errors.invalid_credentials": "The access token is incorrect.",
    "errors.too_many_attempts": "Too many sign-in attempts. Try again shortly.",
    "errors.untrusted_origin": "This browser origin is not trusted by the PalmTTY Agent.",
    "errors.too_many_session_requests": "Too many session requests. Try again shortly.",
    "errors.invalid_workspace_request": "The workspace definition is invalid.",
    "errors.workspace_invalid": "The workspace could not be validated on this host.",
    "errors.workspace_not_found": "The workspace no longer exists.",
    "errors.workspace_in_use": "This workspace still has an active or retained session.",
    "errors.too_many_workspace_requests": "Too many workspace changes. Try again shortly.",
    "errors.http_401": "Please sign in again.",
    "errors.http_403": "This request was rejected by the security policy.",
    "errors.http_404": "The requested resource was not found.",
    "errors.http_409": "The requested change conflicts with the current state.",
    "errors.http_429": "Too many requests. Try again shortly.",
    "errors.http_500": "The PalmTTY Agent reported an internal error."
  },
  "zh-CN": {
    "app.eyebrow": "自托管远程开发终端",
    "app.language": "语言",
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
    "workspaces.deleteConfirm": "确定删除这个工作区吗？已有终端不会因此退出，但仍有活动或保留会话的工作区不能删除。",
    "sessions.title": "会话",
    "sessions.refresh": "刷新",
    "sessions.empty": "还没有会话。",
    "sessions.terminate": "终止会话",
    "sessions.connectionOne": "{count} 个连接",
    "sessions.connectionOther": "{count} 个连接",
    "sessions.state.starting": "启动中",
    "sessions.state.running": "运行中",
    "sessions.state.exited": "已退出",
    "sessions.state.failed": "失败",
    "workspace.addTitle": "新建工作区",
    "workspace.editTitle": "编辑工作区",
    "workspace.name": "名称",
    "workspace.namePlaceholder": "我的项目",
    "workspace.cwd": "工作目录",
    "workspace.cwdHostPlaceholder": "C:\\Code\\project 或 /home/me/project",
    "workspace.cwdWslPlaceholder": "/home/me/project",
    "workspace.runtime": "运行环境",
    "workspace.shell": "Shell",
    "workspace.shellOptional": "可选；留空使用该运行环境的默认 Shell",
    "workspace.shellHostWindows": "pwsh.exe（默认）或其他可执行文件",
    "workspace.shellHostUnix": "默认使用 $SHELL / /bin/sh",
    "workspace.shellWsl": "/bin/bash、/usr/bin/zsh 等",
    "workspace.distribution": "WSL 发行版",
    "workspace.distributionOptional": "可选；留空使用默认 WSL 发行版",
    "workspace.distributionPlaceholder": "Ubuntu-24.04",
    "workspace.startupCommand": "启动命令",
    "workspace.startupOptional": "可选；终端启动后自动发送",
    "workspace.startupPlaceholder": "codex",
    "workspace.hostHelp": "直接在 PalmTTY Agent 所在宿主系统中运行。",
    "workspace.wslHelp": "通过 wsl.exe 运行；工作目录与 Shell 均填写所选发行版内的 Linux 路径。",
    "workspace.cancel": "取消",
    "workspace.save": "保存",
    "workspace.saving": "正在保存…",
    "workspace.delete": "删除",
    "workspace.deleting": "正在删除…",
    "terminal.back": "会话",
    "terminal.specialKeys": "终端特殊按键",
    "terminal.composer": "输入较长命令或 AI 提示词…",
    "terminal.send": "发送",
    "terminal.connection.connecting": "正在连接",
    "terminal.connection.connected": "已连接",
    "terminal.connection.reconnecting": "正在重连",
    "terminal.connection.closed": "已断开",
    "terminal.sessionExited": "[PalmTTY] 会话已退出{code}",
    "errors.startup_failed": "PalmTTY 启动未完成。",
    "errors.login_failed": "登录失败。",
    "errors.session_create_failed": "无法创建终端会话。",
    "errors.authentication_required": "请重新登录。",
    "errors.invalid_credentials": "访问令牌不正确。",
    "errors.too_many_attempts": "登录尝试过于频繁，请稍后重试。",
    "errors.untrusted_origin": "当前网页来源未被 PalmTTY Agent 信任。",
    "errors.too_many_session_requests": "会话创建请求过于频繁，请稍后重试。",
    "errors.invalid_workspace_request": "工作区定义无效。",
    "errors.workspace_invalid": "该工作区无法在当前宿主机上通过验证。",
    "errors.workspace_not_found": "该工作区已不存在。",
    "errors.workspace_in_use": "该工作区仍有活动或保留中的会话。",
    "errors.too_many_workspace_requests": "工作区修改过于频繁，请稍后重试。",
    "errors.http_401": "请重新登录。",
    "errors.http_403": "该请求被安全策略拒绝。",
    "errors.http_404": "未找到请求的资源。",
    "errors.http_409": "该修改与当前状态冲突。",
    "errors.http_429": "请求过于频繁，请稍后重试。",
    "errors.http_500": "PalmTTY Agent 发生内部错误。"
  }
} as const;

type MessageKey = keyof typeof messages.en;
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
