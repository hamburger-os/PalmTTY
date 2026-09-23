import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { WorkspacePublic } from "@palmtty/protocol";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { FilesPane } from "./FilesPane.js";
import { GitPane } from "./GitPane.js";
import { useI18n } from "./i18n.js";
import {
  TerminalView,
  type ConnectionState
} from "./TerminalView.js";
import { workbenchVisualViewportFrame } from "./visual-viewport.js";

type WorkbenchPane = "terminal" | "git" | "files";

export function SessionWorkbench({
  sessionId,
  workspace,
  onBack,
  onRestart
}: {
  sessionId: string;
  workspace?: WorkspacePublic;
  onBack(): void;
  onRestart(): Promise<void>;
}) {
  const { t } = useI18n();
  const [pane, setPane] = useState<WorkbenchPane>("terminal");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [gitWritesEnabled, setGitWritesEnabled] = useState(false);

  const handleConnectionChange = useCallback((next: ConnectionState) => {
    setConnection(next);
  }, []);
  const workbenchRef = useRef<HTMLElement>(null);

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

  const selectPane = (next: WorkbenchPane) => {
    if (next !== "terminal" && !workspace) return;
    setPane(next);
  };

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
            ← {t("terminal.back")}
          </button>
          <strong className="workbench-name">
            {workspace?.name ?? t("workbench.session")}
          </strong>
        </div>

        <nav className="workbench-tabs" role="tablist" aria-label={t("workbench.views")}>
          {(["terminal", "git", "files"] as const).map((item) => (
            <button
              type="button"
              role="tab"
              key={item}
              className={pane === item ? "selected" : ""}
              aria-selected={pane === item}
              disabled={item !== "terminal" && !workspace}
              onClick={() => selectPane(item)}
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
          <button
            type="button"
            className="ghost compact"
            title={t("terminal.restart")}
            aria-label={t("terminal.restart")}
            disabled={restarting || connection === "stopping"}
            onClick={() => setRestartConfirmOpen(true)}
          >
            {restarting ? "…" : "↻"}
          </button>
          <span className={`connection ${connection}`}>
            {t(`terminal.connection.${connection}`)}
          </span>
        </div>
      </header>

      <div className="workbench-content">
        <div className={`workbench-pane${pane === "terminal" ? " is-active" : ""}`}>
          <TerminalView
            sessionId={sessionId}
            active={pane === "terminal"}
            onConnectionChange={handleConnectionChange}
          />
        </div>

        {workspace && pane === "git" && (
          <div className="workbench-pane is-active">
            <GitPane
              workspaceId={workspace.id}
              writesEnabled={gitWritesEnabled}
              onEnableWrites={() => setGitWritesEnabled(true)}
            />
          </div>
        )}

        {workspace && pane === "files" && (
          <div className="workbench-pane is-active">
            <FilesPane workspaceId={workspace.id} />
          </div>
        )}
      </div>

      {restartConfirmOpen && (
        <ConfirmDialog
          title={t("terminal.restartTitle")}
          message={t("terminal.restartConfirm")}
          confirmLabel={t("terminal.restart")}
          busy={restarting}
          onCancel={() => setRestartConfirmOpen(false)}
          onConfirm={() => {
            setRestartConfirmOpen(false);
            setRestartError(null);
            setRestarting(true);
            void onRestart()
              .catch(() => setRestartError(t("errors.session_restart_failed")))
              .finally(() => setRestarting(false));
          }}
        />
      )}
    </main>
  );
}
