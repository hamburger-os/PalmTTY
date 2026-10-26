import { useState } from "react";
import type { WebAppId, WebAppStatus, WorkspacePublic } from "@palmtty/protocol";
import { ApiError, authorizeWebApp } from "./api.js";
import { useI18n } from "./i18n.js";

export function workspaceCodeUrl(root: string, workspace: WorkspacePublic): string | undefined {
  if (workspace.terminal.runtime.kind !== "host") return undefined;
  const folder = workspace.cwd.replaceAll("\\", "/");
  if (!folder.startsWith("/") && !/^[A-Za-z]:\//u.test(folder)) return undefined;
  const url = new URL(root);
  url.searchParams.set("folder", folder.startsWith("/") ? folder : "/" + folder);
  return url.href;
}

/** Independent navigation only: bootstrap credentials never become a rendered href. */
export function WebApplicationLink({ id, status, workspace, label }: {
  id: WebAppId; status?: WebAppStatus | undefined; workspace?: WorkspacePublic; label?: string;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const root = status?.accessUrl;
  const target = root && (workspace ? workspaceCodeUrl(root, workspace) : root);
  const ready = status && ["running", "external"].includes(status.phase);
  const text = label ?? t("integrations.open");
  if (!ready || !target) return <button className="ghost compact" type="button" disabled
    title={t(workspace?.terminal.runtime.kind === "wsl" ? "integrations.unsupportedWorkspace" : !root ? "integrations.remoteSetup" : `integrations.phase.${status?.phase ?? "detecting"}`)}>{text} ↗</button>;
  return <span className="web-application-link">
    <a className="action ghost compact" href={target} target="_blank" rel="noopener noreferrer"
      aria-disabled={busy} onClick={(event) => {
        if (busy) { event.preventDefault(); return; }
        if (!status.canAuthorize) return;
        event.preventDefault(); setError(undefined);
        // Open synchronously for mobile popup policies. The private process URL
        // is used only in this explicit navigation and never stored in UI state.
        const popup = window.open("about:blank", "_blank");
        if (!popup) { setError(t("integrations.popupBlocked")); return; }
        popup.opener = null; setBusy(true);
        void authorizeWebApp(id).then(({ url }) => {
          const destination = new URL(url);
          const folder = new URL(target).searchParams.get("folder");
          if (folder) destination.searchParams.set("folder", folder);
          popup.location.replace(destination.href);
        }).catch((cause: unknown) => {
          // Ordinary navigation remains available to already signed-in users
          // when the separate bootstrap budget has been exhausted.
          if (cause instanceof ApiError && cause.code === "too_many_web_app_requests") {
            popup.location.replace(target);
          } else {
            popup.close(); setError(t("integrations.authorizationFailed"));
          }
        })
          .finally(() => setBusy(false));
      }}>{text} ↗</a>
    {error && <span role="alert" className="error-banner">{error}</span>}
  </span>;
}
