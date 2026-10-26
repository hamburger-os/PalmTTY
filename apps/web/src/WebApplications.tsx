import { useState } from "react";
import type { WebAppId, WebAppStatus, WorkspacePublic } from "@palmtty/protocol";
import { authorizeWebApp, ensureWebApp } from "./api.js";
import { useI18n } from "./i18n.js";

function workspaceCodeFolder(workspace: WorkspacePublic): string | undefined {
  if (workspace.terminal.runtime.kind !== "host") return undefined;
  const folder = workspace.cwd.replaceAll("\\", "/");
  if (!folder.startsWith("/") && !/^[A-Za-z]:\//u.test(folder)) return undefined;
  return folder.startsWith("/") ? folder : "/" + folder;
}

export function workspaceCodeUrl(root: string, workspace: WorkspacePublic): string | undefined {
  const folder = workspaceCodeFolder(workspace);
  if (!folder) return undefined;
  const url = new URL(root);
  url.searchParams.set("folder", folder);
  return url.href;
}

export function WebApplicationPanel({ id, status, workspace, onRefresh }: {
  id: WebAppId; status?: WebAppStatus | undefined; workspace?: WorkspacePublic;
  onRefresh(): Promise<void>;
}) {
  const { t } = useI18n();
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string>();
  const root = status?.embedUrl;
  const target = root && (workspace ? workspaceCodeUrl(root, workspace) : root);
  const unsupported = Boolean(workspace && !workspaceCodeFolder(workspace));
  const phase = status?.phase ?? "detecting";
  const src = ["running", "external"].includes(phase) ? target : undefined;
  const canRetry = status?.canEnsure && ["not_installed", "installed", "failed"].includes(phase);
  const authorize = async () => {
    setError(undefined);
    const popup = window.open("about:blank", "_blank");
    if (!popup) { setError(t("integrations.popupBlocked")); return; }
    popup.opener = null;
    try { popup.location.replace((await authorizeWebApp(id)).url); }
    catch { popup.close(); setError(t("integrations.authorizationFailed")); }
  };
  return <section className="web-app-panel">
    <div className="web-app-toolbar glass-panel">
      <strong>{t(`integrations.${id}`)}</strong>
      <div className="integration-actions">
        {status?.canAuthorize && <button type="button" className="compact" onClick={() => void authorize()}>{t("integrations.authorize")}</button>}
        {src && <a className="action ghost compact" href={src} target="_blank" rel="noopener noreferrer">{t("integrations.openSeparate")} ↗</a>}
        {src && <button className="ghost compact" type="button" onClick={() => setReload((value) => value + 1)}>{t("integrations.reload")}</button>}
      </div>
    </div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    {src ? <div className="web-app-frame glass-content">
      <iframe key={reload} title={t(`integrations.${id}`)} src={src} referrerPolicy="no-referrer" allow="clipboard-read; clipboard-write; fullscreen"/>
    </div> : <section className="glass-card web-app-unavailable" role="status">
      <p>{t(`integrations.phase.${phase}`)}</p>
      {unsupported ? <p>{t("integrations.unsupportedWorkspace")}</p> : !root ? <p>{t("integrations.remoteSetup")}</p> : status?.detail ? <p>{t(`integrations.detail.${status.detail}` as Parameters<typeof t>[0])}</p> : null}
      {canRetry && <button type="button" onClick={() => {
        void ensureWebApp(id).then(onRefresh).catch(() => setError(t("integrations.ensureFailed")));
      }}>{t("integrations.retry")}</button>}
    </section>}
  </section>;
}
