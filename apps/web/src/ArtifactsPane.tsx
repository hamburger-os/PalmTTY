import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionArtifact } from "@palmtty/protocol";
import { ConfirmDialog } from "./ConfirmDialog.js";
import {
  ApiError,
  deleteSessionArtifact,
  listSessionArtifacts,
  readSessionArtifactContent,
  uploadSessionArtifact
} from "./api.js";
import { useI18n } from "./i18n.js";

function displaySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(
  cause: unknown,
  fallback: string,
  translateError: (code: string) => string
): string {
  if (cause instanceof ApiError) {
    const message = translateError(cause.code);
    return cause.detail ? `${message} ${cause.detail}` : message;
  }
  return translateError(fallback);
}

export function ArtifactsPane({
  sessionId,
  canUpload,
  canInsert,
  onInsertPath
}: {
  sessionId: string;
  canUpload: boolean;
  canInsert: boolean;
  onInsertPath(path: string): void;
}) {
  const { t, error: translateError } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [artifacts, setArtifacts] = useState<SessionArtifact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<SessionArtifact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const selected = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedId) ?? null,
    [artifacts, selectedId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listSessionArtifacts(sessionId)
      .then((result) => {
        if (cancelled) return;
        setArtifacts(result.artifacts);
        setSelectedId((current) => (
          current && result.artifacts.some((artifact) => artifact.id === current)
            ? current
            : null
        ));
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(errorMessage(cause, "artifact_list_failed", translateError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshVersion, translateError]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setPreviewError(null);
    setPreviewUrl(null);

    if (!selected) {
      setPreviewing(false);
      return () => undefined;
    }

    setPreviewing(true);
    void readSessionArtifactContent(sessionId, selected.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((cause) => {
        if (!cancelled) {
          setPreviewError(errorMessage(
            cause,
            "artifact_preview_failed",
            translateError
          ));
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewing(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sessionId, selected, translateError]);

  const upload = (file: File) => {
    setUploading(true);
    setError(null);
    void uploadSessionArtifact(sessionId, file)
      .then(({ artifact }) => {
        setArtifacts((current) => [
          artifact,
          ...current.filter((item) => item.id !== artifact.id)
        ]);
        setSelectedId(artifact.id);
      })
      .catch((cause) => {
        setError(errorMessage(cause, "artifact_upload_failed", translateError));
      })
      .finally(() => setUploading(false));
  };

  return (
    <>
      <section className={`artifacts-pane tool-pane glass-content${selected ? " has-preview" : ""}`}>
        <div className="artifact-browser">
          <div className="tool-pane-toolbar">
            <div className="tool-pane-title">
              <strong>{t("artifacts.title")}</strong>
              <span>{t("artifacts.sessionScope")}</span>
            </div>
            <div className="tool-pane-actions">
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) upload(file);
                }}
              />
              <button
                type="button"
                className="compact"
                disabled={uploading || !canUpload}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? t("artifacts.uploading") : t("artifacts.upload")}
              </button>
              <button
                type="button"
                className="ghost compact"
                disabled={loading}
                onClick={() => setRefreshVersion((value) => value + 1)}
              >
                {t("artifacts.refresh")}
              </button>
            </div>
          </div>

          <div className="artifact-help">{t("artifacts.help")}</div>
          {error && <div className="tool-inline-error">{error}</div>}
          {loading ? (
            <div className="tool-empty">{t("artifacts.loading")}</div>
          ) : artifacts.length === 0 ? (
            <div className="tool-empty">{t("artifacts.empty")}</div>
          ) : (
            <div className="artifact-list" role="list">
              {artifacts.map((artifact) => (
                <button
                  type="button"
                  role="listitem"
                  key={artifact.id}
                  className={`artifact-row${selectedId === artifact.id ? " selected" : ""}`}
                  onClick={() => setSelectedId(artifact.id)}
                >
                  <span className="artifact-row-icon" aria-hidden="true">▧</span>
                  <span className="artifact-row-name">
                    <strong>{artifact.name}</strong>
                    <small>
                      {artifact.width}×{artifact.height} · {displaySize(artifact.size)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="artifact-preview">
          {selected && (
            <div className="tool-pane-toolbar artifact-preview-toolbar">
              <button
                type="button"
                className="ghost compact artifact-preview-back"
                onClick={() => setSelectedId(null)}
              >
                ← {t("artifacts.back")}
              </button>
              <strong title={selected.name}>{selected.name}</strong>
              <span>{displaySize(selected.size)}</span>
            </div>
          )}

          {!selected ? (
            <div className="tool-empty">{t("artifacts.select")}</div>
          ) : previewError ? (
            <div className="tool-inline-error">{previewError}</div>
          ) : previewing ? (
            <div className="tool-empty">{t("artifacts.previewing")}</div>
          ) : previewUrl ? (
            <>
              <div className="artifact-preview-content">
                <img
                  src={previewUrl}
                  alt={selected.name}
                  draggable={false}
                />
              </div>
              <div className="artifact-details">
                <code title={selected.terminalPath}>{selected.terminalPath}</code>
                <div className="tool-pane-actions">
                  <button
                    type="button"
                    className="compact"
                    disabled={!canInsert}
                    onClick={() => onInsertPath(selected.terminalPath)}
                  >
                    {t("artifacts.insertPath")}
                  </button>
                  <button
                    type="button"
                    className="danger-outline compact"
                    disabled={deleting}
                    onClick={() => setDeleteCandidate(selected)}
                  >
                    {t("artifacts.delete")}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {deleteCandidate && (
        <ConfirmDialog
          title={t("artifacts.deleteTitle")}
          message={t("artifacts.deleteConfirm", { name: deleteCandidate.name })}
          confirmLabel={t("artifacts.delete")}
          danger
          busy={deleting}
          onCancel={() => setDeleteCandidate(null)}
          onConfirm={() => {
            const artifact = deleteCandidate;
            setDeleteCandidate(null);
            setDeleting(true);
            setError(null);
            void deleteSessionArtifact(sessionId, artifact.id)
              .then(() => {
                setArtifacts((current) =>
                  current.filter((item) => item.id !== artifact.id)
                );
                setSelectedId((current) =>
                  current === artifact.id ? null : current
                );
              })
              .catch((cause) => {
                setError(errorMessage(
                  cause,
                  "artifact_delete_failed",
                  translateError
                ));
              })
              .finally(() => setDeleting(false));
          }}
        />
      )}
    </>
  );
}
