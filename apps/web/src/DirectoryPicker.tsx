import { useCallback, useEffect, useState } from "react";
import type { DirectoryListing } from "@palmtty/protocol";
import { ApiError, browseWorkspaceDirectory } from "./api.js";
import { useI18n } from "./i18n.js";

type Props = {
  kind: "host" | "wsl";
  distribution?: string;
  initialPath?: string;
  onChoose(path: string): void;
  onClose(): void;
};

export function DirectoryPicker({
  kind,
  distribution,
  initialPath,
  onChoose,
  onClose
}: Props) {
  const { t, error: translateError } = useI18n();
  const [startingPath] = useState(() => initialPath?.trim() || undefined);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError) {
      const message = translateError(cause.code);
      return cause.detail ? `${message} ${cause.detail}` : message;
    }
    if (cause instanceof Error) return cause.message;
    return translateError("directory_unavailable");
  }, [translateError]);

  const browse = useCallback(async (
    path?: string,
    allowFallback = false
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await browseWorkspaceDirectory(
        kind === "wsl"
          ? {
              kind: "wsl",
              ...(distribution?.trim()
                ? { distribution: distribution.trim() }
                : {}),
              ...(path ? { path } : {})
            }
          : {
              kind: "host",
              ...(path ? { path } : {})
            }
      );
      setListing(result);
    } catch (cause) {
      if (path && allowFallback) {
        try {
          const fallback = await browseWorkspaceDirectory(
            kind === "wsl"
              ? {
                  kind: "wsl",
                  ...(distribution?.trim()
                    ? { distribution: distribution.trim() }
                    : {})
                }
              : { kind: "host" }
          );
          setListing(fallback);
          setError(t("workspace.directoryFallback"));
          return;
        } catch (fallbackCause) {
          setError(formatError(fallbackCause));
          return;
        }
      }
      setError(formatError(cause));
    } finally {
      setBusy(false);
    }
  }, [distribution, formatError, kind, t]);

  useEffect(() => {
    void browse(startingPath, true);
  }, [browse, startingPath]);

  return (
    <div className="directory-picker" aria-label={t("workspace.directoryPicker")}>
      <div className="directory-picker-heading">
        <div>
          <strong>{t("workspace.directoryPicker")}</strong>
          <small>{t("workspace.directoryPickerHelp")}</small>
        </div>
        <button
          type="button"
          className="ghost compact"
          onClick={onClose}
        >
          {t("workspace.directoryClose")}
        </button>
      </div>

      {listing && (
        <>
          <div className="directory-locations" aria-label={t("workspace.directoryLocations")}>
            {listing.locations.map((location) => (
              <button
                type="button"
                className="chip"
                key={location.path}
                disabled={busy}
                title={location.path}
                onClick={() => void browse(location.path)}
              >
                {location.label}
              </button>
            ))}
          </div>

          <div className="directory-current">
            <code title={listing.currentPath}>{listing.currentPath}</code>
            <div className="directory-current-actions">
              <button
                type="button"
                className="ghost compact"
                disabled={busy || !listing.parentPath}
                onClick={() => {
                  if (listing.parentPath) void browse(listing.parentPath);
                }}
              >
                ↑ {t("workspace.directoryUp")}
              </button>
              <button
                type="button"
                className="ghost compact"
                disabled={busy}
                onClick={() => void browse(listing.currentPath)}
              >
                {t("workspace.directoryRefresh")}
              </button>
            </div>
          </div>

          <div className="directory-list">
            {listing.directories.length === 0 && !busy && (
              <div className="directory-empty">{t("workspace.directoryEmpty")}</div>
            )}
            {listing.directories.map((directory) => (
              <button
                type="button"
                className="directory-row"
                key={directory.path}
                disabled={busy}
                title={directory.path}
                onClick={() => void browse(directory.path)}
              >
                <span className="directory-row-name">{directory.label}</span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>

          {listing.truncated && (
            <small className="directory-warning">
              {t("workspace.directoryTruncated")}
            </small>
          )}

          <button
            type="button"
            className="directory-choose"
            disabled={busy}
            onClick={() => onChoose(listing.currentPath)}
          >
            {t("workspace.directoryUseCurrent")}
          </button>
        </>
      )}

      {busy && <small className="directory-loading">{t("workspace.directoryLoading")}</small>}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
