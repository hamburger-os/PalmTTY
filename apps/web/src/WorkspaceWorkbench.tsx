import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { WorkspacePublic } from "@palmtty/protocol";
import { ArtifactsPane } from "./ArtifactsPane.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { FilesPane } from "./FilesPane.js";
import { GitPane } from "./GitPane.js";
import { useI18n } from "./i18n.js";
import { TerminalView, type ConnectionState, type TerminalInsertRequest } from "./TerminalView.js";
import { workbenchVisualViewportFrame } from "./visual-viewport.js";

export type WorkbenchActivity = {
  kind: "terminal";
  sessionId: string;
  onRestart(): Promise<void>;
};
type WorkbenchPane = "terminal" | "git" | "files" | "artifacts";
export type WorkbenchActivityOption = { value: string; label: string };

export function WorkspaceWorkbench({
  workspace, activity, activityOptions, onSwitchActivity, onBack
}: {
  workspace?: WorkspacePublic;
  activity: WorkbenchActivity;
  activityOptions: WorkbenchActivityOption[];
  onSwitchActivity(value: string): void;
  onBack(): void;
}) {
  const { t } = useI18n();
  const [pane, setPane] = useState<WorkbenchPane>("terminal");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [terminalConnection, setTerminalConnection] = useState<ConnectionState>("connecting");
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
    "terminal", ...(workspace ? (["git", "files"] as const) : []), "artifacts"
  ];
  const showFileHistory = (path: string) => {
    if (!workspace) return;
    setGitHistoryPath(path);
    setPane("git");
  };
  const insertArtifactPath = (artifactPath: string) => {
    terminalInsertSequence.current += 1;
    setTerminalInsert({ id: terminalInsertSequence.current, text: artifactPath + " " });
    setPane("terminal");
  };

  return (
    <main ref={workbenchRef} className="workbench-page is-terminal">
      <header className="workbench-header glass-panel">
        <div className="workbench-leading">
          <button type="button" className="ghost compact" onClick={onBack} disabled={restarting}>
            ← {t("workbench.back")}
          </button>
          <strong className="workbench-name">{workspace?.name ?? t("workbench.session")}</strong>
          {activityOptions.length > 1 && (
            <select className="glass-input glass-select workbench-activity-switcher"
              aria-label={t("workbench.activitySwitcher")}
              value={"terminal:" + activity.sessionId}
              onChange={(event) => onSwitchActivity(event.target.value)}>
              {activityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}
        </div>
        <nav className={"workbench-tabs" + (mobileToolsOpen ? " mobile-open" : "")}
          role="tablist" aria-label={t("workbench.views")}>
          {tabs.map((item) => (
            <button type="button" role="tab" key={item} className={pane === item ? "selected" : ""}
              aria-selected={pane === item}
              onClick={() => {
                if (item === "git") setGitHistoryPath(undefined);
                setPane(item);
                setMobileToolsOpen(false);
              }}>{t(`workbench.${item}`)}</button>
          ))}
        </nav>
        <div className="workbench-actions">
          <button type="button" className="ghost compact mobile-workbench-tools"
            aria-label={t("workbench.tools")} aria-expanded={mobileToolsOpen}
            onClick={() => setMobileToolsOpen((open) => !open)}>{t("workbench.tools")}</button>
          {restartError && <span className="workbench-error" title={restartError}>{restartError}</span>}
          <button type="button" className="ghost compact" title={t("terminal.restart")}
            aria-label={t("terminal.restart")}
            disabled={restarting || terminalConnection === "stopping"}
            onClick={() => setRestartConfirmOpen(true)}>{restarting ? "…" : "↻"}</button>
          <span className={`connection ${terminalConnection}`}>
            {t(`terminal.connection.${terminalConnection}`)}
          </span>
        </div>
      </header>
      <div className="workbench-content">
        <div className={`workbench-pane${pane === "terminal" ? " is-active" : ""}`}>
          <TerminalView key={activity.sessionId} sessionId={activity.sessionId}
            active={pane === "terminal"} insertRequest={terminalInsert}
            onConnectionChange={terminalConnectionChanged}/>
        </div>
        {workspace && pane === "git" && (
          <div className="workbench-pane is-active">
            <GitPane workspaceId={workspace.id} writesEnabled={gitWritesEnabled}
              onEnableWrites={() => setGitWritesEnabled(true)}
              {...(gitHistoryPath ? { initialHistoryPath: gitHistoryPath } : {})}/>
          </div>
        )}
        {workspace && pane === "files" && (
          <div className="workbench-pane is-active">
            <FilesPane workspaceId={workspace.id} onShowHistory={showFileHistory}/>
          </div>
        )}
        {pane === "artifacts" && (
          <div className="workbench-pane is-active">
            <ArtifactsPane sessionId={activity.sessionId}
              canUpload={terminalConnection === "connected"} canInsert={terminalConnection === "connected"}
              onInsertPath={insertArtifactPath}/>
          </div>
        )}
      </div>
      {restartConfirmOpen && (
        <ConfirmDialog title={t("terminal.restartTitle")} message={t("terminal.restartConfirm")}
          confirmLabel={t("terminal.restart")} busy={restarting}
          onCancel={() => setRestartConfirmOpen(false)}
          onConfirm={() => {
            setRestartConfirmOpen(false);
            setRestarting(true);
            setRestartError(null);
            void activity.onRestart()
              .catch((cause: unknown) => setRestartError(
                cause instanceof Error ? cause.message : t("errors.session_restart_failed")
              ))
              .finally(() => setRestarting(false));
          }}/>
      )}
    </main>
  );
}
