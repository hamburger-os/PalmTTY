import { useEffect, useMemo, useState } from "react";
import type {
  WorkspaceFileListResponse,
  WorkspaceFileReadResponse
} from "@palmtty/protocol";
import {
  ApiError,
  listWorkspaceFiles,
  readWorkspaceFile,
  readWorkspaceFileContent,
  readWorkspaceImage
} from "./api.js";
import { useI18n } from "./i18n.js";

function displaySize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function fileMime(path: string, binary: boolean): string {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return binary ? "application/octet-stream" : "text/plain;charset=utf-8";
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for browsers/contexts that reject the async Clipboard API.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard write failed");
}

export function FilesPane({
  workspaceId,
  onShowHistory
}: {
  workspaceId: string;
  onShowHistory?(path: string): void;
}) {
  const { t, error: translateError } = useI18n();
  const [path, setPath] = useState("");
  const [listing, setListing] = useState<WorkspaceFileListResponse | null>(null);
  const [selected, setSelected] = useState<WorkspaceFileReadResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fileActionError, setFileActionError] = useState<string | null>(null);
  const [fileActionStatus, setFileActionStatus] = useState<string | null>(null);
  const [fileAction, setFileAction] = useState<"copy" | "share" | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);
    void listWorkspaceFiles(workspaceId, path)
      .then((result) => {
        if (cancelled) return;
        setListing(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        const code = cause instanceof ApiError ? cause.code : "workspace_file_unavailable";
        setListError(translateError(code));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, path, refreshVersion, translateError]);

  const currentLabel = useMemo(() => path || t("files.root"), [path, t]);

  useEffect(() => {
    setFileActionError(null);
    setFileActionStatus(null);
    if (!selectedPath) {
      setSelected(null);
      setReading(false);
      return;
    }

    let cancelled = false;
    setReading(true);
    setPreviewError(null);
    setSelected(null);
    void readWorkspaceFile(workspaceId, selectedPath)
      .then((result) => {
        if (!cancelled) setSelected(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        const code = cause instanceof ApiError ? cause.code : "workspace_file_unavailable";
        setPreviewError(translateError(code));
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, selectedPath, refreshVersion, translateError]);

  useEffect(() => {
    setImageUrl(null);
    if (!selectedPath || !selected?.binary) {
      setImageLoading(false);
      return () => undefined;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setImageLoading(true);
    void readWorkspaceImage(workspaceId, selectedPath)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch((cause) => {
        if (cancelled) return;
        if (
          cause instanceof ApiError &&
          cause.code === "workspace_image_unavailable"
        ) {
          setImageUrl(null);
          return;
        }
        const code = cause instanceof ApiError
          ? cause.code
          : "workspace_file_unavailable";
        setPreviewError(translateError(code));
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    workspaceId,
    selectedPath,
    selected?.binary,
    refreshVersion,
    translateError
  ]);

  const openFile = (filePath: string) => {
    setSelectedPath(filePath);
  };

  const copySelectedFile = async () => {
    if (!selectedPath || !selected || selected.binary || fileAction) return;
    setFileAction("copy");
    setFileActionError(null);
    setFileActionStatus(null);
    try {
      let text = selected.content;
      if (selected.truncated) {
        const blob = await readWorkspaceFileContent(workspaceId, selectedPath);
        const bytes = await blob.arrayBuffer();
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      }
      await copyText(text);
      setFileActionStatus(t("files.copied"));
    } catch (cause) {
      const code = cause instanceof ApiError
        ? cause.code
        : "workspace_file_content_unavailable";
      setFileActionError(translateError(code));
    } finally {
      setFileAction(null);
    }
  };

  const shareSelectedFile = async () => {
    if (!selectedPath || !selected || fileAction) return;
    setFileAction("share");
    setFileActionError(null);
    setFileActionStatus(null);
    try {
      const blob = await readWorkspaceFileContent(workspaceId, selectedPath);
      const name = fileName(selectedPath);
      const file = new File([blob], name, {
        type: fileMime(selectedPath, selected.binary)
      });
      const shareData: ShareData = { files: [file], title: name };

      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        try {
          await navigator.share(shareData);
          return;
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          throw cause;
        }
      }

      const url = URL.createObjectURL(file);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.rel = "noopener";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (cause) {
      const code = cause instanceof ApiError
        ? cause.code
        : "workspace_file_content_unavailable";
      setFileActionError(translateError(code));
    } finally {
      setFileAction(null);
    }
  };

  const shareSupported = typeof navigator.share === "function";

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

        {listError && <div className="tool-inline-error">{listError}</div>}
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
            <div className="file-preview-heading">
              <strong title={selectedPath}>{fileName(selectedPath)}</strong>
              <span title={parentPath(selectedPath)}>
                {parentPath(selectedPath)
                  ? t("files.parentPath", { path: parentPath(selectedPath) })
                  : t("files.root")}
                {selected ? ` · ${displaySize(selected.size)}` : ""}
              </span>
            </div>
            <div className="file-preview-actions">
              {selected && !selected.binary && (
                <button
                  type="button"
                  className="ghost compact"
                  disabled={fileAction !== null}
                  onClick={() => void copySelectedFile()}
                >
                  {fileAction === "copy" ? t("files.copying") : t("files.copy")}
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  className="ghost compact"
                  disabled={fileAction !== null}
                  onClick={() => void shareSelectedFile()}
                >
                  {fileAction === "share"
                    ? t("files.exporting")
                    : shareSupported
                      ? t("files.share")
                      : t("files.download")}
                </button>
              )}
              {onShowHistory && selected && (
                <button
                  type="button"
                  className="ghost compact"
                  disabled={fileAction !== null}
                  onClick={() => onShowHistory(selectedPath)}
                >
                  {t("files.history")}
                </button>
              )}
            </div>
          </div>
        )}
        {previewError ? (
          <div className="tool-inline-error">{previewError}</div>
        ) : reading ? (
          <div className="tool-empty">{t("files.reading")}</div>
        ) : !selectedPath ? (
          <div className="tool-empty">{t("files.select")}</div>
        ) : imageLoading ? (
          <div className="tool-empty">{t("files.imageLoading")}</div>
        ) : selected?.binary && imageUrl ? (
          <div className="file-image-preview">
            <img src={imageUrl} alt={selectedPath} draggable={false} />
          </div>
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
        {fileActionError && <div className="tool-inline-error">{fileActionError}</div>}
        {fileActionStatus && <div className="tool-hint file-action-status">{fileActionStatus}</div>}
      </div>
    </section>
  );
}
