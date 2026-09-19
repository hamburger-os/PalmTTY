import { useCallback, useEffect, useState } from "react";
import type { SessionPublic, WorkspacePublic } from "@palmtty/protocol";
import {
  authStatus,
  createSession,
  listSessions,
  listWorkspaces,
  login,
  logout,
  terminateSession
} from "./api.js";
import { TerminalView } from "./TerminalView.js";

type AuthState = { enabled: boolean; authenticated: boolean };

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspacePublic[]>([]);
  const [sessions, setSessions] = useState<SessionPublic[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [workspaceResult, sessionResult] = await Promise.all([
      listWorkspaces(),
      listSessions()
    ]);
    setWorkspaces(workspaceResult.workspaces);
    setSessions(sessionResult.sessions);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const status = await authStatus();
        setAuth(status);
        if (status.authenticated) await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "startup_failed");
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!auth?.authenticated || activeSession) return;
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
  }, [auth?.authenticated, activeSession, refresh]);

  if (auth === null) {
    return <main className="center-card"><h1>PalmTTY</h1><p>Connecting…</p></main>;
  }

  if (!auth.authenticated) {
    return <Login onLogin={async (token) => {
      setError(null);
      try {
        await login(token);
        const status = await authStatus();
        setAuth(status);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "login_failed");
      }
    }} error={error} />;
  }

  if (activeSession) {
    return (
      <TerminalView
        sessionId={activeSession}
        onBack={() => {
          setActiveSession(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">self-hosted remote dev</div>
          <h1>PalmTTY</h1>
        </div>
        {auth.enabled && (
          <button className="ghost" onClick={() => void (async () => {
            await logout();
            setAuth({ enabled: true, authenticated: false });
            setSessions([]);
          })()}>Sign out</button>
        )}
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section>
        <div className="section-heading">
          <h2>Workspaces</h2>
          <span>{workspaces.length}</span>
        </div>
        <div className="card-grid">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              className="workspace-card"
              onClick={() => void (async () => {
                setError(null);
                try {
                  const result = await createSession(workspace.id);
                  setActiveSession(result.session.id);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "session_create_failed");
                }
              })()}
            >
              <strong>{workspace.name}</strong>
              <small>{workspace.shell}{workspace.startupCommand ? ` · ${workspace.startupCommand}` : ""}</small>
              <span>New session →</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Sessions</h2>
          <button className="ghost compact" onClick={() => void refresh()}>Refresh</button>
        </div>
        <div className="session-list">
          {sessions.length === 0 && <div className="empty">No sessions yet.</div>}
          {sessions.map((session) => (
            <div className="session-row" key={session.id}>
              <button className="session-main" onClick={() => setActiveSession(session.id)}>
                <span className={`status-dot ${session.state}`} />
                <span>
                  <strong>{workspaces.find((workspace) => workspace.id === session.workspaceId)?.name ?? session.workspaceId}</strong>
                  <small>{session.state} · {session.connections} connection{session.connections === 1 ? "" : "s"}</small>
                </span>
              </button>
              <button
                className="danger compact"
                aria-label="Terminate session"
                onClick={() => void (async () => {
                  await terminateSession(session.id);
                  await refresh();
                })()}
              >×</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Login({ onLogin, error }: { onLogin: (token: string) => Promise<void>; error: string | null }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <main className="center-card">
      <div className="palm-mark">⌁</div>
      <h1>PalmTTY</h1>
      <p>Enter the access token configured on your workstation.</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onLogin(token).finally(() => setBusy(false));
      }}>
        <input
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Access token"
          autoFocus
        />
        <button type="submit" disabled={busy || token.length === 0}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error && <div className="error-banner">{error}</div>}
    </main>
  );
}
