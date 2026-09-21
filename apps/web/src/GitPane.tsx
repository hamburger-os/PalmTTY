import { useEffect, useState } from "react";
import type {
  GitDiffResponse,
  GitStatusEntry,
  GitStatusResponse
} from "@palmtty/protocol";
import {
  ApiError,
  workspaceGitDiff,
  workspaceGitStatus
} from "./api.js";
import { useI18n } from "./i18n.js";

type Selection = {
  path: string;
  staged: boolean;
  untracked: boolean;
};

function statusCode(entry: GitStatusEntry, staged: boolean): string {
  if (entry.untracked) return "?";
  const value = staged ? entry.index : entry.worktree;
  return value.trim() || "·";
}

export function GitPane({ workspaceId }: { workspaceId: string }) {
  const { t, error: translateError } = useI18n();
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatusError(null);
    void workspaceGitStatus(workspaceId)
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        setSelection((current) => {
          if (!current) return null;
          const stillPresent = result.entries.some((entry) => entry.path === current.path);
          return stillPresent ? current : null;
        });
      })
      .catch((cause) => {
        if (cancelled) return;
        const code = cause instanceof ApiError ? cause.code : "git_unavailable";
        setStatusError(translateError(code));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshVersion, translateError]);

  useEffect(() => {
    if (!selection || selection.untracked) {
      setDiff(null);
      setDiffLoading(false);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    setDiffError(null);
    void workspaceGitDiff(workspaceId, selection.path, selection.staged)
      .then((result) => {
        if (!cancelled) setDiff(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        const code = cause instanceof ApiError ? cause.code : "git_unavailable";
        setDiffError(translateError(code));
        setDiff(null);
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, selection, translateError]);

  const renderGroup = (
    title: string,
    entries: GitStatusEntry[],
    staged: boolean
  ) => {
    if (entries.length === 0) return null;
    return (
      <div className="git-group">
        <div className="git-group-heading">
          <strong>{title}</strong>
          <span>{entries.length}</span>
        </div>
        <div className="git-change-list">
          {entries.map((entry) => {
            const selected = selection?.path === entry.path &&
              selection.staged === staged;
            return (
              <button
                type="button"
                key={`${staged ? "staged" : "worktree"}:${entry.path}`}
                className={`git-change-row${selected ? " selected" : ""}`}
                onClick={() => setSelection({
                  path: entry.path,
                  staged,
                  untracked: entry.untracked
                })}
              >
                <span className="git-status-code">{statusCode(entry, staged)}</span>
                <span className="git-change-path" title={entry.path}>
                  {entry.path}
                  {entry.originalPath && (
                    <small>{entry.originalPath} →</small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const staged = status?.entries.filter((entry) => entry.staged) ?? [];
  const changes = status?.entries.filter((entry) => entry.unstaged) ?? [];

  return (
    <section className={`git-pane tool-pane glass-content${selection ? " has-preview" : ""}`}>
      <div className="git-sidebar">
        <div className="tool-pane-toolbar">
          <div className="tool-pane-title">
            <strong>{t("git.title")}</strong>
            {status?.available && (
              <span className="git-branch" title={status.root}>
                {status.branch ?? t("git.detached")}
              </span>
            )}
          </div>
          <button
            type="button"
            className="ghost compact"
            onClick={() => setRefreshVersion((value) => value + 1)}
          >
            {t("git.refresh")}
          </button>
        </div>

        {statusError && <div className="tool-inline-error">{statusError}</div>}
        {loading ? (
          <div className="tool-empty">{t("git.loading")}</div>
        ) : status && !status.available ? (
          <div className="tool-empty">{t("git.notRepository")}</div>
        ) : status ? (
          <>
            {(status.upstream || status.ahead > 0 || status.behind > 0) && (
              <div className="git-tracking">
                <span>{status.upstream ?? t("git.noUpstream")}</span>
                <span>↑{status.ahead} ↓{status.behind}</span>
              </div>
            )}
            {status.entries.length === 0 ? (
              <div className="tool-empty">{t("git.clean")}</div>
            ) : (
              <div className="git-groups">
                {renderGroup(t("git.staged"), staged, true)}
                {renderGroup(t("git.changes"), changes, false)}
              </div>
            )}
            {status.truncated && (
              <div className="tool-hint">{t("git.truncated")}</div>
            )}
          </>
        ) : null}
      </div>

      <div className="git-diff">
        {selection && (
          <div className="tool-pane-toolbar git-diff-toolbar">
            <button
              type="button"
              className="ghost compact git-preview-back"
              onClick={() => setSelection(null)}
            >
              ← {t("git.back")}
            </button>
            <strong title={selection.path}>{selection.path}</strong>
            <span>{selection.staged ? t("git.stagedBadge") : t("git.workingTreeBadge")}</span>
          </div>
        )}
        {diffError ? (
          <div className="tool-inline-error">{diffError}</div>
        ) : !selection ? (
          <div className="tool-empty">{t("git.select")}</div>
        ) : selection.untracked ? (
          <div className="tool-empty">{t("git.untrackedPreview")}</div>
        ) : diffLoading ? (
          <div className="tool-empty">{t("git.diffLoading")}</div>
        ) : diff ? (
          <>
            <pre className="git-diff-content" tabIndex={0}>
              {diff.diff || t("git.noDiff")}
            </pre>
            {diff.truncated && (
              <div className="tool-hint">{t("git.diffTruncated")}</div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
