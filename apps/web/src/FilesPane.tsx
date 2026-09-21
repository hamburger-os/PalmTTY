import { useEffect, useMemo, useState } from "react";
import type {
  WorkspaceFileListResponse,
  WorkspaceFileReadResponse
} from "@palmtty/protocol";
import {
  ApiError,
  listWorkspaceFiles,
  readWorkspaceFile
} from "./api.js";
import { useI18n } from "./i18n.js";

function displaySize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPane({ workspaceId }: { workspaceId: string }) {
  const { t, error: translateError } = useI18n();
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<WorkspaceFileListResponse | null>(null);
  const [selected, setSelected] = useState<WorkspaceFileReadResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listWorkspaceFiles(workspaceId, path)
      .then((result) => {
        if (cancelled) return;
        setListing(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        const code = cause instanceof ApiError ? cause.code : "workspace_file_unavailable";
        setError(translateError(code));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, path, refreshVersion, translateError]);

  const currentLabel = useMemo(() => path || t("files.root"), [path, t]);

  const openFile = (filePath: string) => {
    setReading(true);
    setError(null);
    setSelectedPath(filePath);
    void readWorkspaceFile(workspaceId, filePath)
      .then(setSelected)
      .catch((cause) => {
        const code = cause instanceof ApiError ? cause.code : "workspace_file_unavailable";
        setError(translateError(code));
        setSelected(null);
      })
      .finally(() => setReading(false));
  };

  return (
    <section className={`files-pane tool-pane glass-content${selectedPath ? " has-preview" : ""}`}>
      <div className="file-browser">
        <div className="tool-pane-toolbar">
          <div className="tool-pane-title">
            <strong>{t("files.title")}</strong>
            <span className="tool-pane-path" title={path}>{currentLabel}</span>
          </div>
          <div className="tool-pane-actions">
            <button
              type="button"
              className="ghost compact"
              disabled={!listing?.parentPath && listing?.parentPath !== ""}
              onClick={() => {
                const parent = listing?.parentPath;
                if (parent === null || parent === undefined) return;
                setSelected(null);
                setSelectedPath(null);
                setPath(parent);
              }}
            >
              ↑ {t("files.up")}
            </button>
            <button
              type="button"
              className="ghost compact"
              onClick={() => setRefreshVersion((value) => value + 1)}
            >
              {t("files.refresh")}
            </button>
          </div>
        </div>

        {error && <div className="tool-inline-error">{error}</div>}
        {loading ? (
          <div className="tool-empty">{t("files.loading")}</div>
        ) : listing && listing.entries.length > 0 ? (
          <div className="file-list" role="list">
            {listing.entries.map((entry) => (
              <button
                type="button"
                role="listitem"
                key={entry.path}
                className={`file-row${selectedPath === entry.path ? " selected" : ""}`}
                onClick={() => {
                  if (entry.kind === "directory") {
                    setSelected(null);
                    setSelectedPath(null);
                    setPath(entry.path);
                  } else {
                    openFile(entry.path);
                  }
                }}
              >
                <span className="file-row-kind" aria-hidden="true">
                  {entry.kind === "directory" ? "▸" : "·"}
                </span>
                <span className="file-row-name">{entry.name}</span>
                <span className="file-row-size">{displaySize(entry.size)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="tool-empty">{t("files.empty")}</div>
        )}

        {listing?.truncated && (
          <div className="tool-hint">{t("files.truncated")}</div>
        )}
      </div>

      <div className="file-preview">
        {selectedPath && (
          <div className="tool-pane-toolbar file-preview-toolbar">
            <button
              type="button"
              className="ghost compact file-preview-back"
              onClick={() => {
                setSelectedPath(null);
                setSelected(null);
              }}
            >
              ← {t("files.back")}
            </button>
            <strong title={selectedPath}>{selectedPath}</strong>
            {selected && <span>{displaySize(selected.size)}</span>}
          </div>
        )}
        {reading ? (
          <div className="tool-empty">{t("files.reading")}</div>
        ) : !selectedPath ? (
          <div className="tool-empty">{t("files.select")}</div>
        ) : selected?.binary ? (
          <div className="tool-empty">{t("files.binary")}</div>
        ) : selected ? (
          <>
            <pre className="file-preview-content" tabIndex={0}>{selected.content}</pre>
            {selected.truncated && (
              <div className="tool-hint">{t("files.previewTruncated")}</div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
