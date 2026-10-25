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
  integrationLinks,
  ensureWebApp,
  type WebAppId,
  type IntegrationLinks,
  createSession,
  createWorkspace,
  deleteSession,
  deleteWorkspace,
  listSessions,
  listWorkspaces,
  login,
  logout,
  restartSession,
  runtimeCapabilities,
  terminateSession,
  updateWorkspace
} from "./api.js";
import { AppearanceControls } from "./AppearanceControls.js";
import { Brand } from "./Brand.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { useI18n } from "./i18n.js";
import { WorkspaceWorkbench } from "./WorkspaceWorkbench.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import { workspaceRuntimeSummary } from "./workspace-runtime-helpers.js";

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
  const [integrations, setIntegrations] = useState<IntegrationLinks | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspacePublic[]>([]);
  const [sessions, setSessions] = useState<SessionPublic[]>([]);
  const [activeSession, setActiveSession] = useState<SessionPublic | null>(null);
  const [workspaceEditor, setWorkspaceEditor] = useState<WorkspaceEditor>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [sessionAction, setSessionAction] = useState<SessionAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    const [workspaceResult, sessionResult] = await Promise.all([
      listWorkspaces(), listSessions()
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
    void integrationLinks().then(setIntegrations)
      .catch(() => setError(t("integrations.loadFailed")));
    void ensureWebApp("harness").catch(() =>
      setError(t("integrations.ensureFailed"))
    );
    await refreshCatalog();
  }, [refreshCatalog, translateError, t]);

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
    if (!auth?.authenticated) return;
    const poll = window.setInterval(() => {
      void integrationLinks().then(setIntegrations).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(poll);
  }, [auth?.authenticated]);

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
        <Brand hero />
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

  const activityOptionsFor = (
    workspaceId: string,
    currentValue: string
  ) => [
    ...sessions
      .filter((session) =>
        session.workspaceId === workspaceId &&
        (
          isActiveSessionState(session.state) ||
          "terminal:" + session.id === currentValue
        )
      )
      .map((session) => ({
        value: "terminal:" + session.id,
        label: t("workbench.terminal") + " · " + session.id.slice(0, 6)
      })),
  ];

  const switchActivity = (value: string) => {
    if (value.startsWith("terminal:")) {
      const next = sessions.find((session) => "terminal:" + session.id === value);
      if (!next) return;
      setActiveSession(next);
      return;
    }
  };

  if (activeSession) {
    const activeWorkspace = workspaces.find(
      (workspace) => workspace.id === activeSession.workspaceId
    );
    return (
      <WorkspaceWorkbench
        {...(activeWorkspace ? { workspace: activeWorkspace } : {})}
        activity={{
          kind: "terminal",
          sessionId: activeSession.id,
          onRestart: async () => {
            try {
              const result = await restartSession(activeSession.id);
              setSessions((current) => [
                ...current.filter((session) => session.id !== activeSession.id),
                result.session
              ]);
              setActiveSession(result.session);
              void refreshCatalog().catch(() => undefined);
            } catch (cause) {
              // A response may be lost after the server already changed state.
              // Reconcile the catalog rather than relying on stale client data.
              void refreshCatalog().catch(() => undefined);
              throw new Error(formatError(cause, "session_restart_failed", translateError));
            }
          }
        }}
        activityOptions={activityOptionsFor(
          activeSession.workspaceId,
          "terminal:" + activeSession.id
        )}
        onSwitchActivity={switchActivity}
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
    if (!isActiveSessionState(session.state) || session.state === "stopping") return false;

    setSessionBusyId(session.id);
    setActionError(null);
    try {
      await terminateSession(session.id);
      await refreshCatalog();
      return true;
    } catch (cause) {
      setActionError(formatError(cause, "session_action_failed", translateError));
      return false;
    } finally {
      setSessionBusyId(null);
    }
  };

  const clearSession = async (session: SessionPublic) => {
    if (!isTerminalSessionState(session.state)) return false;

    setSessionBusyId(session.id);
    setActionError(null);
    try {
      await deleteSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      return true;
    } catch (cause) {
      setActionError(formatError(cause, "session_action_failed", translateError));
      return false;
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

  const renderWebApp = (id: WebAppId) => {
    const info = integrations?.apps[id];
    const phase = info?.phase ?? "detecting";
    const canRetry = id === "harness" &&
      !["running", "installing", "starting", "detecting"].includes(phase);
    return (
      <section className="glass-card integration-entry" key={id}>
        <div className="integration-detail">
          <strong>{t(`integrations.${id}` as Parameters<typeof t>[0])}</strong>
          <small>{t(`integrations.phase.${phase}` as Parameters<typeof t>[0])}</small>
          {info?.detail && (
            <small>{t(`integrations.detail.${info.detail}` as Parameters<typeof t>[0])}</small>
          )}
          {!info?.accessUrl && id === "harness" && phase === "running" && (
            <small>{t("integrations.remoteSetup")}</small>
          )}
        </div>
        <div className="integration-actions">
          {info?.accessUrl && (
            <a className="ghost compact" href={info.accessUrl}
               target="_blank" rel="noopener noreferrer">
              {t("integrations.open")} ↗
            </a>
          )}
          {canRetry && (
            <button className="ghost compact" type="button" onClick={() => {
              void ensureWebApp(id).then(() =>
                integrationLinks().then(setIntegrations)
              ).catch(() => setError(t("integrations.ensureFailed")));
            }}>{t("integrations.retry")}</button>
          )}
        </div>
      </section>
    );
  };

  const activities = [...sessions].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <main className="app-shell">
      <header className="topbar glass-shell">
        <Brand eyebrow={t("app.eyebrow")} />
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
                setIntegrations(null);
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
      {renderWebApp("harness")}

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
                {workspace.terminal.startupCommand && (
                  <small className="startup-command">
                    $ {workspace.terminal.startupCommand}
                  </small>
                )}
                <button
                  type="button"
                  className="workspace-launch prism-primary"
                  onClick={() => void (async () => {
                    setError(null);
                    try {
                      const result = await createSession(workspace.id);
                      setActiveSession(result.session);
                    } catch (cause) {
                      setError(
                        formatError(cause, "session_create_failed", translateError)
                      );
                    }
                  })()}
                >
                  {t("workspaces.newSession")} →
                </button>
                {renderWebApp("vscodeWeb")}
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-heading">
          <div className="section-title">
            <h2>{t("activities.title")}</h2>
            <span>{activities.length}</span>
          </div>
          <button
            className="ghost compact"
            onClick={() => void refreshCatalog()}
          >
            {t("sessions.refresh")}
          </button>
        </div>
        <div className="session-list">
          {activities.length === 0 && (
            <div className="empty session-empty glass-content">{t("activities.empty")}</div>
          )}
          {activities.map((session) => {
            const active = isActiveSessionState(session.state);
            const busy = sessionBusyId === session.id;
            const workspaceName = workspaces.find(
              (workspace) => workspace.id === session.workspaceId
            )?.name ?? session.workspaceId;
            return (
              <div className="session-row glass-card" key={session.id}>
                <button className="session-main" onClick={() => setActiveSession(session)}>
                  <span className={"status-dot " + session.state} />
                  <span>
                    <strong>{workspaceName}</strong>
                    <small>{t("activities.terminal")} · {sessionDetail(session)}</small>
                  </span>
                </button>
                <button type="button" className="session-action danger-outline compact"
                  disabled={sessionBusyId !== null || session.state === "stopping"}
                  onClick={() => { setActionError(null); setSessionAction({kind: active ? "terminate" : "clear", session}); }}>
                  {busy ? (active ? t("sessions.terminating") : t("sessions.clearing")) :
                    (active ? t("sessions.terminate") : t("sessions.clear"))}
                </button>
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
          error={actionError}
          onCancel={() => setSessionAction(null)}
          onConfirm={() => {
            const action = sessionAction;
            void (async () => {
              const success = action.kind === "terminate"
                ? await stopSession(action.session)
                : await clearSession(action.session);
              if (success) setSessionAction(null);
            })();
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
      <Brand hero />
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
