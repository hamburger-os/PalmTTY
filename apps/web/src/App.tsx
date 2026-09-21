import { useCallback, useEffect, useState } from "react";
import {
  isActiveSessionState,
  isTerminalSessionState,
  type CreateWorkspaceInput,
  type RuntimeCapabilities,
  type SessionPublic,
  type WorkspacePublic
} from "@palmtty/protocol";
import {
  ApiError,
  authStatus,
  createSession,
  createWorkspace,
  deleteSession,
  deleteWorkspace,
  listSessions,
  listWorkspaces,
  login,
  logout,
  runtimeCapabilities,
  terminateSession,
  updateWorkspace
} from "./api.js";
import { AppearanceControls } from "./AppearanceControls.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { useI18n } from "./i18n.js";
import { TerminalView } from "./TerminalView.js";
import {
  WorkspaceDialog,
  workspaceRuntimeSummary
} from "./WorkspaceDialog.js";

type AuthState = { enabled: boolean; authenticated: boolean };
type WorkspaceEditor = WorkspacePublic | "new" | null;
type SessionAction =
  | { kind: "terminate"; session: SessionPublic }
  | { kind: "clear"; session: SessionPublic }
  | null;

function formatError(
  cause: unknown,
  fallback: string,
  translate: (code: string) => string
): string {
  if (cause instanceof ApiError) {
    const message = translate(cause.code);
    return cause.detail ? `${message} ${cause.detail}` : message;
  }
  if (cause instanceof Error) return translate(cause.message);
  return translate(fallback);
}

export function App() {
  const { t, error: translateError, connections } = useI18n();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspacePublic[]>([]);
  const [sessions, setSessions] = useState<SessionPublic[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [workspaceEditor, setWorkspaceEditor] = useState<WorkspaceEditor>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [sessionAction, setSessionAction] = useState<SessionAction>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    const [workspaceResult, sessionResult] = await Promise.all([
      listWorkspaces(),
      listSessions()
    ]);
    setWorkspaces(workspaceResult.workspaces);
    setSessions(sessionResult.sessions);
  }, []);

  const loadAuthenticatedState = useCallback(async () => {
    void runtimeCapabilities()
      .then((runtime) => {
        setCapabilities(runtime);
      })
      .catch(() => {
        setCapabilities(null);
        setError(translateError("runtime_capabilities_failed"));
      });
    await refreshCatalog();
  }, [refreshCatalog, translateError]);

  useEffect(() => {
    void (async () => {
      try {
        const status = await authStatus();
        setAuth(status);
        if (status.authenticated) await loadAuthenticatedState();
      } catch (cause) {
        setError(formatError(cause, "startup_failed", translateError));
      }
    })();
  }, [loadAuthenticatedState, translateError]);

  useEffect(() => {
    if (!auth?.authenticated || activeSession) return;
    const timer = window.setInterval(
      () => void refreshCatalog().catch(() => undefined),
      3000
    );
    return () => window.clearInterval(timer);
  }, [auth?.authenticated, activeSession, refreshCatalog]);

  if (auth === null) {
    return (
      <main className="center-card glass-shell">
        <div className="login-toolbar"><AppearanceControls compact /><LanguageSwitcher /></div>
        <h1>PalmTTY</h1>
        <p>{t("auth.connecting")}</p>
      </main>
    );
  }

  if (!auth.authenticated) {
    return (
      <Login
        onLogin={async (token) => {
          setError(null);
          try {
            await login(token);
            const status = await authStatus();
            setAuth(status);
            await loadAuthenticatedState();
          } catch (cause) {
            setError(formatError(cause, "login_failed", translateError));
          }
        }}
        error={error}
      />
    );
  }

  if (activeSession) {
    return (
      <TerminalView
        sessionId={activeSession}
        onBack={() => {
          setActiveSession(null);
          void refreshCatalog();
        }}
      />
    );
  }

  const stateLabel = (state: SessionPublic["state"]) => {
    switch (state) {
      case "starting": return t("sessions.state.starting");
      case "running": return t("sessions.state.running");
      case "stopping": return t("sessions.state.stopping");
      case "exited": return t("sessions.state.exited");
      case "failed": return t("sessions.state.failed");
    }
  };

  const sessionDetail = (session: SessionPublic) => {
    if (isTerminalSessionState(session.state)) {
      return session.exitCode === undefined
        ? stateLabel(session.state)
        : `${stateLabel(session.state)} · ${t("sessions.exitCode", {
            code: session.exitCode
          })}`;
    }
    return `${stateLabel(session.state)} · ${connections(session.connections)}`;
  };

  const stopSession = async (session: SessionPublic) => {
    if (!isActiveSessionState(session.state) || session.state === "stopping") return;

    setSessionBusyId(session.id);
    setError(null);
    try {
      await terminateSession(session.id);
      await refreshCatalog();
    } catch (cause) {
      setError(formatError(cause, "session_action_failed", translateError));
    } finally {
      setSessionBusyId(null);
    }
  };

  const clearSession = async (session: SessionPublic) => {
    if (!isTerminalSessionState(session.state)) return;

    setSessionBusyId(session.id);
    setError(null);
    try {
      await deleteSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (cause) {
      setError(formatError(cause, "session_action_failed", translateError));
    } finally {
      setSessionBusyId(null);
    }
  };

  const closeWorkspaceEditor = () => {
    if (workspaceBusy) return;
    setWorkspaceEditor(null);
    setWorkspaceError(null);
  };

  const saveWorkspace = async (input: CreateWorkspaceInput) => {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      if (workspaceEditor === "new") {
        await createWorkspace(input);
      } else if (workspaceEditor) {
        await updateWorkspace(workspaceEditor.id, input);
      }
      await refreshCatalog();
      setWorkspaceEditor(null);
    } catch (cause) {
      setWorkspaceError(
        formatError(cause, "workspace_invalid", translateError)
      );
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const removeWorkspace = async () => {
    if (!workspaceEditor || workspaceEditor === "new") return;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    try {
      await deleteWorkspace(workspaceEditor.id);
      await refreshCatalog();
      setWorkspaceEditor(null);
    } catch (cause) {
      setWorkspaceError(
        formatError(cause, "workspace_invalid", translateError)
      );
    } finally {
      setWorkspaceBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar glass-shell">
        <div>
          <div className="eyebrow">{t("app.eyebrow")}</div>
          <h1>PalmTTY</h1>
        </div>
        <div className="topbar-actions">
          <AppearanceControls compact />
          <LanguageSwitcher />
          {auth.enabled && (
            <button
              className="ghost"
              onClick={() => void (async () => {
                await logout();
                setAuth({ enabled: true, authenticated: false });
                setCapabilities(null);
                setWorkspaces([]);
                setSessions([]);
              })()}
            >
              {t("auth.signOut")}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section>
        <div className="section-heading">
          <div className="section-title">
            <h2>{t("workspaces.title")}</h2>
            <span>{workspaces.length}</span>
          </div>
          <button
            className="compact"
            onClick={() => {
              setWorkspaceError(null);
              setWorkspaceEditor("new");
            }}
          >
            + {t("workspaces.add")}
          </button>
        </div>

        {workspaces.length === 0 ? (
          <div className="empty workspace-empty glass-content">{t("workspaces.empty")}</div>
        ) : (
          <div className="card-grid">
            {workspaces.map((workspace) => (
              <article key={workspace.id} className="workspace-card glass-card">
                <div className="workspace-card-heading">
                  <strong>{workspace.name}</strong>
                  <button
                    type="button"
                    className="ghost compact"
                    onClick={() => {
                      setWorkspaceError(null);
                      setWorkspaceEditor(workspace);
                    }}
                  >
                    {t("workspaces.edit")}
                  </button>
                </div>
                <small className="workspace-path">{workspace.cwd}</small>
                <small>
                  {workspaceRuntimeSummary(workspace, {
                    host: t("workspaces.host"),
                    wsl: t("workspaces.wsl"),
                    defaultShell: t("workspaces.defaultShell")
                  })}
                </small>
                {workspace.startupCommand && (
                  <small className="startup-command">
                    $ {workspace.startupCommand}
                  </small>
                )}
                <button
                  type="button"
                  className="workspace-launch prism-primary"
                  onClick={() => void (async () => {
                    setError(null);
                    try {
                      const result = await createSession(workspace.id);
                      setActiveSession(result.session.id);
                    } catch (cause) {
                      setError(
                        formatError(cause, "session_create_failed", translateError)
                      );
                    }
                  })()}
                >
                  {t("workspaces.newSession")} →
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-heading">
          <h2>{t("sessions.title")}</h2>
          <button
            className="ghost compact"
            onClick={() => void refreshCatalog()}
          >
            {t("sessions.refresh")}
          </button>
        </div>
        <div className="session-list">
          {sessions.length === 0 && (
            <div className="empty session-empty glass-content">{t("sessions.empty")}</div>
          )}
          {sessions.map((session) => {
            const active = isActiveSessionState(session.state);
            const busy = sessionBusyId === session.id;
            return (
              <div className="session-row glass-card" key={session.id}>
                <button
                  className="session-main"
                  onClick={() => setActiveSession(session.id)}
                >
                  <span className={`status-dot ${session.state}`} />
                  <span>
                    <strong>
                      {workspaces.find(
                        (workspace) => workspace.id === session.workspaceId
                      )?.name ?? session.workspaceId}
                    </strong>
                    <small>{sessionDetail(session)}</small>
                  </span>
                </button>
                {active ? (
                  <button
                    type="button"
                    className="session-action danger-outline compact"
                    disabled={sessionBusyId !== null || session.state === "stopping"}
                    onClick={() => setSessionAction({ kind: "terminate", session })}
                  >
                    {busy || session.state === "stopping"
                      ? t("sessions.terminating")
                      : t("sessions.terminate")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="session-action danger-outline compact"
                    disabled={sessionBusyId !== null}
                    onClick={() => setSessionAction({ kind: "clear", session })}
                  >
                    {busy ? t("sessions.clearing") : t("sessions.clear")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {workspaceEditor && (
        <WorkspaceDialog
          capabilities={capabilities}
          {...(workspaceEditor === "new"
            ? {}
            : { workspace: workspaceEditor, onDelete: removeWorkspace })}
          busy={workspaceBusy}
          error={workspaceError}
          onClose={closeWorkspaceEditor}
          onSave={saveWorkspace}
        />
      )}

      {sessionAction && (
        <ConfirmDialog
          title={sessionAction.kind === "terminate"
            ? t("sessions.terminateTitle")
            : t("sessions.clearTitle")}
          message={sessionAction.kind === "terminate"
            ? t("sessions.terminateConfirm", {
                count: sessionAction.session.connections
              })
            : t("sessions.clearConfirm")}
          confirmLabel={sessionAction.kind === "terminate"
            ? t("sessions.terminate")
            : t("sessions.clear")}
          danger
          busy={sessionBusyId === sessionAction.session.id}
          onCancel={() => setSessionAction(null)}
          onConfirm={() => {
            const action = sessionAction;
            setSessionAction(null);
            if (action.kind === "terminate") {
              void stopSession(action.session);
            } else {
              void clearSession(action.session);
            }
          }}
        />
      )}
    </main>
  );
}

function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language-switcher">
      <span className="sr-only">{t("app.language")}</span>
      <select
        aria-label={t("app.language")}
        className="glass-input glass-select language-select"
        value={locale}
        onChange={(event) => setLocale(event.target.value as "en" | "zh-CN")}
      >
        <option value="zh-CN">中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}

function Login({
  onLogin,
  error
}: {
  onLogin: (token: string) => Promise<void>;
  error: string | null;
}) {
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="center-card glass-shell">
      <div className="login-toolbar"><AppearanceControls compact /><LanguageSwitcher /></div>
      <div className="palm-mark">⌁</div>
      <h1>PalmTTY</h1>
      <p>{t("auth.description")}</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onLogin(token).finally(() => setBusy(false));
      }}>
        <input
          type="password"
          className="glass-input"
          autoComplete="current-password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t("auth.token")}
          autoFocus
        />
        <button className="prism-primary" type="submit" disabled={busy || token.length === 0}>
          {busy ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>
      {error && <div className="error-banner">{error}</div>}
    </main>
  );
}
