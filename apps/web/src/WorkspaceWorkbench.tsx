import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type {
  AppSessionPublic,
  WorkspacePublic
} from "@palmtty/protocol";
import { ArtifactsPane } from "./ArtifactsPane.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { FilesPane } from "./FilesPane.js";
import { GitPane } from "./GitPane.js";
import { useI18n } from "./i18n.js";
import {
  RemoteAppView,
  type RemoteAppConnectionState
} from "./RemoteAppView.js";
import {
  TerminalView,
  type ConnectionState,
  type TerminalInsertRequest
} from "./TerminalView.js";
import { workbenchVisualViewportFrame } from "./visual-viewport.js";

export type WorkbenchActivity =
  | {
      kind: "terminal";
      sessionId: string;
      onRestart(): Promise<void>;
    }
  | {
      kind: "remoteApp";
      session: AppSessionPublic;
    };

type WorkbenchPane =
  | "terminal"
  | "remoteApp"
  | "git"
  | "files"
  | "artifacts";

export function WorkspaceWorkbench({
  workspace,
  activity,
  onBack
}: {
  workspace?: WorkspacePublic;
  activity: WorkbenchActivity;
  onBack(): void;
}) {
  const { t } = useI18n();
  const initialPane: WorkbenchPane = activity.kind === "terminal"
    ? "terminal"
    : "remoteApp";
  const [pane, setPane] = useState<WorkbenchPane>(initialPane);
  const [terminalConnection, setTerminalConnection] =
    useState<ConnectionState>("connecting");
  const [appConnection, setAppConnection] =
    useState<RemoteAppConnectionState>("connecting");
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [gitWritesEnabled, setGitWritesEnabled] = useState(false);
  const [gitHistoryPath, setGitHistoryPath] = useState<string>();
  const [terminalInsert, setTerminalInsert] = useState<TerminalInsertRequest>();
  const terminalInsertSequence = useRef(0);
  const workbenchRef = useRef<HTMLElement>(null);

  const terminalConnectionChanged = useCallback((next: ConnectionState) => {
    setTerminalConnection(next);
  }, []);
  const appConnectionChanged = useCallback((next: RemoteAppConnectionState) => {
    setAppConnection(next);
  }, []);

  useLayoutEffect(() => {
    const element = workbenchRef.current;
    const visualViewport = window.visualViewport;
    if (!element || !visualViewport) return;

    let animationFrame: number | undefined;

    const clearVisualViewportFrame = () => {
      element.classList.remove("has-visual-viewport-frame");
      for (const property of [
        "--workbench-visual-top",
        "--workbench-visual-left",
        "--workbench-visual-width",
        "--workbench-visual-height"
      ]) {
        element.style.removeProperty(property);
      }
    };

    const syncVisualViewportFrame = () => {
      animationFrame = undefined;
      const frame = workbenchVisualViewportFrame(visualViewport);
      if (!frame) {
        clearVisualViewportFrame();
        return;
      }
      element.style.setProperty("--workbench-visual-top", `${frame.top}px`);
      element.style.setProperty("--workbench-visual-left", `${frame.left}px`);
      element.style.setProperty("--workbench-visual-width", `${frame.width}px`);
      element.style.setProperty("--workbench-visual-height", `${frame.height}px`);
      element.classList.add("has-visual-viewport-frame");
    };

    const scheduleVisualViewportSync = () => {
      if (animationFrame !== undefined) return;
      animationFrame = window.requestAnimationFrame(syncVisualViewportFrame);
    };

    syncVisualViewportFrame();
    visualViewport.addEventListener("resize", scheduleVisualViewportSync);
    visualViewport.addEventListener("scroll", scheduleVisualViewportSync);
    window.addEventListener("resize", scheduleVisualViewportSync);

    return () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      visualViewport.removeEventListener("resize", scheduleVisualViewportSync);
      visualViewport.removeEventListener("scroll", scheduleVisualViewportSync);
      window.removeEventListener("resize", scheduleVisualViewportSync);
      clearVisualViewportFrame();
    };
  }, []);

  const tabs: WorkbenchPane[] = [
    activity.kind === "terminal" ? "terminal" : "remoteApp",
    ...(workspace ? (["git", "files"] as const) : []),
    ...(activity.kind === "terminal" ? (["artifacts"] as const) : [])
  ];

  const showFileHistory = (path: string) => {
    if (!workspace) return;
    setGitHistoryPath(path);
    setPane("git");
  };

  const insertArtifactPath = (artifactPath: string) => {
    if (activity.kind !== "terminal") return;
    terminalInsertSequence.current += 1;
    setTerminalInsert({
      id: terminalInsertSequence.current,
      text: `${artifactPath} `
    });
    setPane("terminal");
  };

  const status = activity.kind === "terminal"
    ? terminalConnection
    : appConnection;

  return (
    <main ref={workbenchRef} className="workbench-page">
      <header className="workbench-header glass-panel">
        <div className="workbench-leading">
          <button
            type="button"
            className="ghost compact"
            onClick={onBack}
            disabled={restarting}
          >
            ← {t("workbench.back")}
          </button>
          <strong className="workbench-name">
            {workspace?.name ?? t("workbench.session")}
          </strong>
          {activity.kind === "remoteApp" && (
            <span className="workbench-activity-name">
              {activity.session.profileName}
            </span>
          )}
        </div>

        <nav
          className="workbench-tabs"
          role="tablist"
          aria-label={t("workbench.views")}
        >
          {tabs.map((item) => (
            <button
              type="button"
              role="tab"
              key={item}
              className={pane === item ? "selected" : ""}
              aria-selected={pane === item}
              onClick={() => {
                if (item === "git") setGitHistoryPath(undefined);
                setPane(item);
              }}
            >
              {t(`workbench.${item}`)}
            </button>
          ))}
        </nav>

        <div className="workbench-actions">
          {restartError && (
            <span className="workbench-error" title={restartError}>
              {restartError}
            </span>
          )}
          {activity.kind === "terminal" && (
            <button
              type="button"
              className="ghost compact"
              title={t("terminal.restart")}
              aria-label={t("terminal.restart")}
              disabled={restarting || terminalConnection === "stopping"}
              onClick={() => setRestartConfirmOpen(true)}
            >
              {restarting ? "…" : "↻"}
            </button>
          )}
          <span className={`connection ${status}`}>
            {activity.kind === "terminal"
              ? t(`terminal.connection.${terminalConnection}`)
              : t(`remoteApp.connection.${appConnection}`)}
          </span>
        </div>
      </header>

      <div className="workbench-content">
        {activity.kind === "terminal" && (
          <div className={`workbench-pane${pane === "terminal" ? " is-active" : ""}`}>
            <TerminalView
              sessionId={activity.sessionId}
              active={pane === "terminal"}
              insertRequest={terminalInsert}
              onConnectionChange={terminalConnectionChanged}
            />
          </div>
        )}

        {activity.kind === "remoteApp" && (
          <div className={`workbench-pane${pane === "remoteApp" ? " is-active" : ""}`}>
            <RemoteAppView
              sessionId={activity.session.id}
              active={pane === "remoteApp"}
              onConnectionChange={appConnectionChanged}
            />
          </div>
        )}

        {workspace && pane === "git" && (
          <div className="workbench-pane is-active">
            <GitPane
              workspaceId={workspace.id}
              writesEnabled={gitWritesEnabled}
              onEnableWrites={() => setGitWritesEnabled(true)}
              {...(gitHistoryPath ? { initialHistoryPath: gitHistoryPath } : {})}
            />
          </div>
        )}

        {workspace && pane === "files" && (
          <div className="workbench-pane is-active">
            <FilesPane
              workspaceId={workspace.id}
              onShowHistory={showFileHistory}
            />
          </div>
        )}

        {activity.kind === "terminal" && pane === "artifacts" && (
          <div className="workbench-pane is-active">
            <ArtifactsPane
              sessionId={activity.sessionId}
              canUpload={terminalConnection === "connected"}
              canInsert={terminalConnection === "connected"}
              onInsertPath={insertArtifactPath}
            />
          </div>
        )}
      </div>

      {activity.kind === "terminal" && restartConfirmOpen && (
        <ConfirmDialog
          title={t("terminal.restartTitle")}
          message={t("terminal.restartConfirm")}
          confirmLabel={t("terminal.restart")}
          busy={restarting}
          onCancel={() => setRestartConfirmOpen(false)}
          onConfirm={() => {
            setRestartConfirmOpen(false);
            setRestarting(true);
            setRestartError(null);
            void activity.onRestart()
              .catch(() => setRestartError(t("errors.session_restart_failed")))
              .finally(() => setRestarting(false));
          }}
        />
      )}
    </main>
  );
}
