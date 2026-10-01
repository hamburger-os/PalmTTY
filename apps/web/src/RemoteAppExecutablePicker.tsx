import { useCallback, useEffect, useState } from "react";
import type {
  RemoteAppCatalogEntry,
  RemoteAppExecutableListing
} from "@palmtty/protocol";
import {
  ApiError,
  browseRemoteAppExecutables,
  detectRemoteApps
} from "./api.js";
import { useI18n } from "./i18n.js";

export function RemoteAppExecutablePicker({
  onChoose
}: {
  onChoose(entry: RemoteAppCatalogEntry): void;
}) {
  const { t, error: translateError } = useI18n();
  const [catalog, setCatalog] = useState<RemoteAppCatalogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [listing, setListing] = useState<RemoteAppExecutableListing | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(true);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError) {
      const translated = translateError(cause.code);
      return cause.detail ? `${translated} ${cause.detail}` : translated;
    }
    return cause instanceof Error
      ? cause.message
      : translateError("remote_app_browse_unavailable");
  }, [translateError]);

  useEffect(() => {
    let cancelled = false;
    setCatalogBusy(true);
    void detectRemoteApps()
      .then((result) => {
        if (!cancelled) setCatalog(result.apps);
      })
      .catch((cause) => {
        if (!cancelled) setError(formatError(cause));
      })
      .finally(() => {
        if (!cancelled) setCatalogBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formatError]);

  const browse = useCallback(async (path?: string) => {
    setBrowseBusy(true);
    setError(null);
    try {
      setListing(await browseRemoteAppExecutables(path ? { path } : {}));
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      setBrowseBusy(false);
    }
  }, [formatError]);

  return (
    <div className="remote-app-picker">
      <section className="remote-app-picker-section">
        <div className="settings-section-heading">
          <div>
            <strong>{t("workspace.remoteAppDetected")}</strong>
            <small>{t("workspace.remoteAppDetectedHelp")}</small>
          </div>
        </div>

        {catalogBusy && (
          <small className="settings-muted">{t("workspace.remoteAppDetecting")}</small>
        )}
        {!catalogBusy && catalog.length === 0 && (
          <div className="settings-empty glass-content">
            {t("workspace.remoteAppDetectedEmpty")}
          </div>
        )}
        {catalog.length > 0 && (
          <>
            <input
              className="glass-input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("workspace.remoteAppSearch")}
              aria-label={t("workspace.remoteAppSearch")}
            />
            <div className="settings-list executable-browser-list">
              {catalog.filter((entry) =>
                (entry.name + " " + entry.executable).toLowerCase()
                  .includes(search.trim().toLowerCase())
              ).map((entry) => (
                <button
                  type="button"
                  className="settings-list-row"
                  key={entry.executable}
                  onClick={() => onChoose(entry)}
                >
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{entry.executable}</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
              {search.trim() && !catalog.some((entry) =>
                (entry.name + " " + entry.executable).toLowerCase()
                  .includes(search.trim().toLowerCase())
              ) && <div className="settings-empty">{t("workspace.remoteAppNoMatch")}</div>}
            </div>
          </>
        )}
      </section>

      <section className="remote-app-picker-section">
        <div className="settings-section-heading">
          <div>
            <strong>{t("workspace.remoteAppBrowseTitle")}</strong>
            <small>{t("workspace.remoteAppBrowseHelp")}</small>
          </div>
          {!listing && (
            <button
              type="button"
              className="ghost compact"
              disabled={browseBusy}
              onClick={() => void browse()}
            >
              {t("workspace.remoteAppBrowse")}
            </button>
          )}
        </div>

        {listing && (
          <div className="executable-browser glass-control">
            <div className="directory-locations">
              {listing.locations.map((location) => (
                <button
                  type="button"
                  className="chip"
                  key={location.path}
                  disabled={browseBusy}
                  onClick={() => void browse(location.path)}
                >
                  {location.label}
                </button>
              ))}
            </div>

            <div className="directory-current glass-content">
              <code title={listing.currentPath}>{listing.currentPath}</code>
              <div className="directory-current-actions">
                <button
                  type="button"
                  className="ghost compact"
                  disabled={browseBusy || !listing.parentPath}
                  onClick={() => {
                    if (listing.parentPath) void browse(listing.parentPath);
                  }}
                >
                  ↑ {t("workspace.directoryUp")}
                </button>
                <button
                  type="button"
                  className="ghost compact"
                  disabled={browseBusy}
                  onClick={() => void browse(listing.currentPath)}
                >
                  {t("workspace.directoryRefresh")}
                </button>
              </div>
            </div>

            <div className="executable-browser-list">
              {listing.directories.map((directory) => (
                <button
                  type="button"
                  className="directory-row"
                  key={directory.path}
                  disabled={browseBusy}
                  onClick={() => void browse(directory.path)}
                >
                  <span className="directory-row-name">📁 {directory.label}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
              {listing.executables.map((entry) => (
                <button
                  type="button"
                  className="directory-row executable-row"
                  key={entry.executable}
                  disabled={browseBusy}
                  onClick={() => onChoose(entry)}
                >
                  <span className="directory-row-name">▣ {entry.name}</span>
                  <span>{t("workspace.remoteAppUse")}</span>
                </button>
              ))}
              {!browseBusy &&
                listing.directories.length === 0 &&
                listing.executables.length === 0 && (
                  <div className="directory-empty">
                    {t("workspace.remoteAppBrowseEmpty")}
                  </div>
                )}
            </div>
            {listing.truncated && (
              <small className="directory-warning">
                {t("workspace.directoryTruncated")}
              </small>
            )}
          </div>
        )}
      </section>

      {browseBusy && (
        <small className="settings-muted">{t("workspace.directoryLoading")}</small>
      )}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
