import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  GitBranch,
  GitChange,
  GitCommitDetailResponse,
  GitCommitFile,
  GitCommitSummary,
  GitDiffResponse,
  GitMutationOperation,
  GitStatusResponse
} from "@palmtty/protocol";
import {
  ApiError,
  workspaceGitBranches,
  workspaceGitCommit,
  workspaceGitCommitDiff,
  workspaceGitDiff,
  workspaceGitHistory,
  workspaceGitMutate,
  workspaceGitRemote,
  workspaceGitStatus
} from "./api.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import {
  canRestoreWorkingTreeChange,
  gitMutationPaths
} from "./git-change.js";
import { parseUnifiedDiff } from "./git-diff.js";
import { useI18n } from "./i18n.js";

type Selection = {
  path: string;
  staged: boolean;
};

type RestoreConfirmation = {
  path: string;
  snapshot: string;
} | null;

type GitView = "changes" | "history";

const STATUS_CODES: Record<string, string> = {
  modified: "M",
  typeChanged: "T",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  unmerged: "U"
};

const COMMIT_STATUS_CODES: Record<GitCommitFile["status"], string> = {
  modified: "M",
  typeChanged: "T",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C"
};

function statusCode(entry: GitChange, staged: boolean): string {
  if (entry.untracked) return "?";
  const value = staged ? entry.indexStatus : entry.worktreeStatus;
  return value ? (STATUS_CODES[value] ?? "·") : "·";
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function repositoryFilePath(workspacePath: string, filePath: string): string {
  return workspacePath ? `${workspacePath}/${filePath}` : filePath;
}

export function GitPane({
  workspaceId,
  writesEnabled,
  onEnableWrites,
  initialHistoryPath
}: {
  workspaceId: string;
  writesEnabled: boolean;
  onEnableWrites(): void;
  initialHistoryPath?: string;
}) {
  const { t, error: translateError } = useI18n();
  const [view, setView] = useState<GitView>(
    initialHistoryPath ? "history" : "changes"
  );
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [trustConfirmOpen, setTrustConfirmOpen] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<RestoreConfirmation>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchSelection, setBranchSelection] = useState("");

  const [historyPath, setHistoryPath] = useState<string | undefined>(
    initialHistoryPath
  );
  const [history, setHistory] = useState<GitCommitSummary[]>([]);
  const [historyNextCursor, setHistoryNextCursor] = useState<string>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitDetailResponse | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);
  const [commitDiff, setCommitDiff] = useState<string | null>(null);
  const [commitDiffBinary, setCommitDiffBinary] = useState(false);
  const [commitDiffTruncated, setCommitDiffTruncated] = useState(false);
  const [commitDiffLoading, setCommitDiffLoading] = useState(false);
  const [commitDiffError, setCommitDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialHistoryPath) return;
    setView("history");
    setHistoryPath(initialHistoryPath);
    setSelectedCommitOid(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
  }, [initialHistoryPath]);

  const applyStatus = useCallback((result: GitStatusResponse) => {
    setStatus(result);
    setSelection((current) => {
      if (!current) return null;
      const entry = result.changes.find((item) => item.path === current.path);
      if (!entry) return null;
      const stillPresent = current.staged ? entry.staged : entry.unstaged;
      return stillPresent ? current : null;
    });
  }, []);

  const loadStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setStatusError(null);
    try {
      const result = await workspaceGitStatus(workspaceId);
      applyStatus(result);
      return result;
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "git_unavailable";
      setStatusError(translateError(code));
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [applyStatus, translateError, workspaceId]);

  const loadBranches = useCallback(async () => {
    try {
      const result = await workspaceGitBranches(workspaceId);
      setBranches(result.branches);
      const current = result.branches.find((item) => item.current);
      setBranchSelection(current?.name ?? "");
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "git_unavailable";
      setActionError(translateError(code));
    }
  }, [translateError, workspaceId]);

  const refreshAll = useCallback(async (showLoading = false) => {
    const result = await loadStatus(showLoading);
    if (result?.available) {
      await loadBranches();
    } else {
      setBranches([]);
    }
  }, [loadBranches, loadStatus]);

  const loadHistory = useCallback(async (
    cursor?: string,
    append = false
  ) => {
    if (historyPath && !status?.repository) return;
    const requestedPath = historyPath && status?.repository
      ? repositoryFilePath(status.repository.workspacePath, historyPath)
      : undefined;

    append ? setHistoryLoadingMore(true) : setHistoryLoading(true);
    setHistoryError(null);
    try {
      const result = await workspaceGitHistory(workspaceId, {
        limit: 30,
        ...(cursor ? { cursor } : {}),
        ...(requestedPath ? { path: requestedPath } : {})
      });
      setHistory((current) => append
        ? [...current, ...result.commits]
        : result.commits
      );
      setHistoryNextCursor(result.nextCursor);
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "git_unavailable";
      setHistoryError(translateError(code));
      if (!append) {
        setHistory([]);
        setHistoryNextCursor(undefined);
      }
    } finally {
      append ? setHistoryLoadingMore(false) : setHistoryLoading(false);
    }
  }, [
    historyPath,
    status?.repository,
    translateError,
    workspaceId
  ]);

  useEffect(() => {
    void refreshAll(true);
  }, [refreshAll]);

  useEffect(() => {
    if (view !== "history") return;
    setSelectedCommitOid(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    void loadHistory();
  }, [historyPath, loadHistory, view]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !busy) {
        void loadStatus(false);
      }
    };
    const timer = window.setInterval(refreshVisible, 5_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [busy, loadStatus]);

  useEffect(() => {
    if (!selection) {
      setDiff(null);
      setDiffLoading(false);
      setDiffError(null);
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
  }, [
    selection,
    status?.repository?.stateToken,
    translateError,
    workspaceId
  ]);

  useEffect(() => {
    if (!selectedCommitOid) {
      setSelectedCommit(null);
      setCommitLoading(false);
      setCommitError(null);
      return;
    }
    let cancelled = false;
    setCommitLoading(true);
    setCommitError(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    void workspaceGitCommit(workspaceId, selectedCommitOid)
      .then((result) => {
        if (!cancelled) setSelectedCommit(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        const code = cause instanceof ApiError ? cause.code : "git_unavailable";
        setCommitError(translateError(code));
      })
      .finally(() => {
        if (!cancelled) setCommitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCommitOid, translateError, workspaceId]);

  useEffect(() => {
    setCommitDiff(null);
    setCommitDiffBinary(false);
    setCommitDiffTruncated(false);
    setCommitDiffError(null);
    if (!selectedCommitOid || !selectedCommitFile) {
      setCommitDiffLoading(false);
      return;
    }
    let cancelled = false;
    setCommitDiffLoading(true);
    void workspaceGitCommitDiff(
      workspaceId,
      selectedCommitOid,
      selectedCommitFile
    )
      .then((result) => {
        if (cancelled) return;
        setCommitDiff(result.diff);
        setCommitDiffBinary(result.binary);
        setCommitDiffTruncated(result.truncated);
      })
      .catch((cause) => {
        if (cancelled) return;
        const code = cause instanceof ApiError ? cause.code : "git_unavailable";
        setCommitDiffError(translateError(code));
      })
      .finally(() => {
        if (!cancelled) setCommitDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selectedCommitFile,
    selectedCommitOid,
    translateError,
    workspaceId
  ]);

  const runMutation = useCallback(async (operation: GitMutationOperation) => {
    const repository = status?.repository;
    if (!repository || busy || !writesEnabled || status?.truncated) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await workspaceGitMutate(workspaceId, {
        expectedState: repository.stateToken,
        allowRepositoryCodeExecution: true,
        operation
      });
      applyStatus(result.status);
      setDiff(null);
      if (operation.type === "commit") setCommitMessage("");
      if (operation.type === "branch.create") setBranchName("");
      await loadBranches();
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "git_operation_failed";
      setActionError(translateError(code));
      await refreshAll(false);
    } finally {
      setBusy(false);
    }
  }, [
    applyStatus,
    busy,
    loadBranches,
    refreshAll,
    status?.repository,
    translateError,
    workspaceId,
    writesEnabled
  ]);

  const runRemote = useCallback(async (operation: "fetch" | "pull" | "push") => {
    const repository = status?.repository;
    if (!repository || busy || !writesEnabled || status?.truncated) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await workspaceGitRemote(workspaceId, {
        expectedState: repository.stateToken,
        allowRepositoryCodeExecution: true,
        operation
      });
      applyStatus(result.status);
      await loadBranches();
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "git_remote_failed";
      setActionError(translateError(code));
      await refreshAll(false);
    } finally {
      setBusy(false);
    }
  }, [
    applyStatus,
    busy,
    loadBranches,
    refreshAll,
    status?.repository,
    translateError,
    workspaceId,
    writesEnabled
  ]);

  const conflicts = status?.changes.filter((entry) => entry.conflict) ?? [];
  const staged = status?.changes.filter(
    (entry) => entry.staged && !entry.conflict
  ) ?? [];
  const changes = status?.changes.filter(
    (entry) => entry.unstaged && !entry.conflict
  ) ?? [];
  const writeReady = writesEnabled && !status?.truncated;

  const diffLines = useMemo(
    () => parseUnifiedDiff(diff?.diff ?? ""),
    [diff?.diff]
  );
  const commitDiffLines = useMemo(
    () => parseUnifiedDiff(commitDiff ?? ""),
    [commitDiff]
  );

  const renderGroup = (
    title: string,
    entries: GitChange[],
    stagedView: boolean,
    actionLabel: string,
    action: (entry: GitChange) => void
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
              selection.staged === stagedView;
            return (
              <div
                key={`${stagedView ? "staged" : "worktree"}:${entry.path}`}
                className={`git-change-row${selected ? " selected" : ""}`}
              >
                <button
                  type="button"
                  className="git-change-main"
                  onClick={() => setSelection({
                    path: entry.path,
                    staged: stagedView
                  })}
                >
                  <span className="git-status-code">
                    {statusCode(entry, stagedView)}
                  </span>
                  <span className="git-change-path" title={entry.path}>
                    {entry.path}
                    {entry.originalPath && (
                      <small>{entry.originalPath} →</small>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="ghost compact git-row-action"
                  title={actionLabel}
                  aria-label={actionLabel}
                  disabled={!writeReady || busy}
                  onClick={() => action(entry)}
                >
                  {stagedView ? "−" : "+"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const repository = status?.repository;
  const selectedChange = selection
    ? status?.changes.find((entry) => entry.path === selection.path)
    : undefined;
  const currentBranch = repository?.head.branch ?? t("git.detached");
  const clean = Boolean(status?.available && status.changes.length === 0);
  const hasPreview = view === "changes"
    ? Boolean(selection)
    : Boolean(selectedCommitOid);

  const selectView = (next: GitView) => {
    setView(next);
    setSelection(null);
    setSelectedCommitOid(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
  };

  return (
    <section className={`git-pane tool-pane glass-content${hasPreview ? " has-preview" : ""}`}>
      <div className="git-sidebar">
        <div className="tool-pane-toolbar git-main-toolbar">
          <div className="tool-pane-title">
            <strong>{t("git.title")}</strong>
            {repository && (
              <span className="git-branch" title={repository.root}>
                {currentBranch}
              </span>
            )}
          </div>
          <button
            type="button"
            className="ghost compact"
            disabled={busy || historyLoading || historyLoadingMore}
            onClick={() => {
              if (view === "history") {
                void loadHistory();
              } else {
                void refreshAll(true);
              }
            }}
          >
            {t("git.refresh")}
          </button>
        </div>

        <div className="git-view-tabs" role="tablist" aria-label={t("git.title")}>
          <button
            type="button"
            role="tab"
            aria-selected={view === "changes"}
            className={view === "changes" ? "selected" : ""}
            onClick={() => selectView("changes")}
          >
            {t("git.viewChanges")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "history"}
            className={view === "history" ? "selected" : ""}
            onClick={() => selectView("history")}
          >
            {t("git.viewHistory")}
          </button>
        </div>

        {statusError && <div className="tool-inline-error">{statusError}</div>}
        {actionError && view === "changes" && (
          <div className="tool-inline-error">{actionError}</div>
        )}

        {view === "history" ? (
          <>
            {historyPath && (
              <div className="git-history-filter">
                <span title={historyPath}>
                  {t("git.historyPath", { path: basename(historyPath) })}
                </span>
                <button
                  type="button"
                  className="ghost compact"
                  onClick={() => setHistoryPath(undefined)}
                >
                  {t("git.historyAll")}
                </button>
              </div>
            )}
            {historyError ? (
              <div className="tool-inline-error">{historyError}</div>
            ) : historyLoading ? (
              <div className="tool-empty">{t("git.historyLoading")}</div>
            ) : history.length === 0 ? (
              <div className="tool-empty">{t("git.noCommits")}</div>
            ) : (
              <div className="git-history-list">
                {history.map((commit) => (
                  <button
                    type="button"
                    className={`git-history-row${selectedCommitOid === commit.oid ? " selected" : ""}`}
                    key={commit.oid}
                    onClick={() => setSelectedCommitOid(commit.oid)}
                  >
                    <code>{commit.shortOid}</code>
                    <span>
                      <strong>{commit.subject}</strong>
                      <small>{commit.author} · {commit.authoredAt}</small>
                    </span>
                  </button>
                ))}
                {historyNextCursor && (
                  <button
                    type="button"
                    className="ghost compact git-history-more"
                    disabled={historyLoadingMore}
                    onClick={() => void loadHistory(historyNextCursor, true)}
                  >
                    {historyLoadingMore
                      ? t("git.historyLoadingMore")
                      : t("git.historyLoadMore")}
                  </button>
                )}
              </div>
            )}
          </>
        ) : loading ? (
          <div className="tool-empty">{t("git.loading")}</div>
        ) : status && !status.available ? (
          <div className="tool-empty">{t("git.notRepository")}</div>
        ) : status && repository ? (
          <>
            <div className="git-repository-summary">
              <div className="git-tracking">
                <span>{repository.upstream ?? t("git.noUpstream")}</span>
                <span>↑{repository.ahead} ↓{repository.behind}</span>
              </div>
              {repository.workspacePath && (
                <div className="tool-hint">
                  {t("git.repositoryScope", { path: repository.workspacePath })}
                </div>
              )}
              <div className="git-command-bar">
                {!writesEnabled ? (
                  <button
                    type="button"
                    className="ghost compact"
                    onClick={() => setTrustConfirmOpen(true)}
                  >
                    {t("git.enableWrites")}
                  </button>
                ) : (
                  <span className="git-write-enabled">{t("git.writesEnabled")}</span>
                )}
                <button
                  type="button"
                  className="ghost compact"
                  disabled={!writeReady || busy}
                  onClick={() => void runRemote("fetch")}
                >
                  {t("git.fetch")}
                </button>
                <button
                  type="button"
                  className="ghost compact"
                  disabled={!writeReady || busy}
                  onClick={() => void runRemote("pull")}
                >
                  {t("git.pull")}
                </button>
                <button
                  type="button"
                  className="ghost compact"
                  disabled={!writeReady || busy}
                  onClick={() => void runRemote("push")}
                >
                  {t("git.push")}
                </button>
              </div>
            </div>

            {status.changes.length === 0 ? (
              <div className="tool-empty">{t("git.clean")}</div>
            ) : (
              <div className="git-groups">
                {conflicts.length > 0 && renderGroup(
                  t("git.conflicts"),
                  conflicts,
                  false,
                  t("git.stage"),
                  (entry) => void runMutation({
                    type: "stage",
                    paths: gitMutationPaths(entry)
                  })
                )}
                {renderGroup(
                  t("git.staged"),
                  staged,
                  true,
                  t("git.unstage"),
                  (entry) => void runMutation({
                    type: "unstage",
                    paths: gitMutationPaths(entry)
                  })
                )}
                {staged.length > 0 && (
                  <button
                    type="button"
                    className="ghost compact git-group-action"
                    disabled={!writeReady || busy}
                    onClick={() => void runMutation({ type: "unstage.all" })}
                  >
                    {t("git.unstageAll")}
                  </button>
                )}
                {renderGroup(
                  t("git.changes"),
                  changes,
                  false,
                  t("git.stage"),
                  (entry) => void runMutation({
                    type: "stage",
                    paths: gitMutationPaths(entry)
                  })
                )}
                {changes.length > 0 && (
                  <button
                    type="button"
                    className="ghost compact git-group-action"
                    disabled={!writeReady || busy}
                    onClick={() => void runMutation({ type: "stage.all" })}
                  >
                    {t("git.stageAll")}
                  </button>
                )}
              </div>
            )}

            <div className="git-commit-panel">
              <textarea
                className="glass-input"
                rows={3}
                maxLength={4096}
                value={commitMessage}
                placeholder={t("git.commitPlaceholder")}
                disabled={!writeReady || busy}
                onChange={(event) => setCommitMessage(event.target.value)}
              />
              <button
                type="button"
                className="primary"
                disabled={
                  !writeReady ||
                  busy ||
                  staged.length === 0 ||
                  commitMessage.trim().length === 0
                }
                onClick={() => void runMutation({
                  type: "commit",
                  message: commitMessage.trim()
                })}
              >
                {t("git.commit")}
              </button>
            </div>

            <details className="git-tools">
              <summary>{t("git.branches")}</summary>
              <div className="git-tools-body">
                <div className="git-inline-form">
                  <select
                    className="glass-input"
                    value={branchSelection}
                    disabled={!writeReady || busy || branches.length === 0}
                    onChange={(event) => setBranchSelection(event.target.value)}
                  >
                    {branches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.current ? "✓ " : ""}{branch.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={
                      !writeReady ||
                      busy ||
                      !branchSelection ||
                      branchSelection === repository.head.branch
                    }
                    onClick={() => void runMutation({
                      type: "branch.switch",
                      name: branchSelection
                    })}
                  >
                    {t("git.switchBranch")}
                  </button>
                </div>
                <div className="git-inline-form">
                  <input
                    className="glass-input"
                    value={branchName}
                    maxLength={512}
                    placeholder={t("git.newBranch")}
                    disabled={!writeReady || busy}
                    onChange={(event) => setBranchName(event.target.value)}
                  />
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={!writeReady || busy || !branchName.trim()}
                    onClick={() => void runMutation({
                      type: "branch.create",
                      name: branchName.trim()
                    })}
                  >
                    {t("git.createBranch")}
                  </button>
                </div>
              </div>
            </details>

            <details className="git-tools">
              <summary>{t("git.stash")}</summary>
              <div className="git-command-bar">
                <button
                  type="button"
                  className="ghost compact"
                  disabled={!writeReady || busy || status.changes.length === 0}
                  onClick={() => void runMutation({
                    type: "stash.push",
                    includeUntracked: true
                  })}
                >
                  {t("git.stashPush")}
                </button>
                <button
                  type="button"
                  className="ghost compact"
                  disabled={!writeReady || busy}
                  onClick={() => void runMutation({ type: "stash.pop" })}
                >
                  {t("git.stashPop")}
                </button>
              </div>
            </details>

            {status.truncated && (
              <div className="tool-hint">{t("git.truncated")}</div>
            )}
          </>
        ) : null}
      </div>

      <div className="git-diff">
        {view === "changes" ? (
          <>
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
                <span>
                  {selection.staged
                    ? t("git.stagedBadge")
                    : t("git.workingTreeBadge")}
                </span>
                {!selection.staged &&
                  diff &&
                  !diff.binary &&
                  !diff.truncated &&
                  canRestoreWorkingTreeChange(selectedChange) && (
                  <button
                    type="button"
                    className="danger compact"
                    disabled={!writeReady || busy}
                    onClick={() => setRestoreConfirm({
                      path: selection.path,
                      snapshot: diff.snapshot
                    })}
                  >
                    {t("git.restore")}
                  </button>
                )}
              </div>
            )}

            {diffError ? (
              <div className="tool-inline-error">{diffError}</div>
            ) : selection && diffLoading ? (
              <div className="tool-empty">{t("git.diffLoading")}</div>
            ) : selection && diff ? (
              diff.binary ? (
                <div className="tool-empty">{t("git.binaryDiff")}</div>
              ) : (
                <>
                  <div className="git-diff-content" tabIndex={0}>
                    {diffLines.length === 0 ? (
                      <div className="tool-empty">{t("git.noDiff")}</div>
                    ) : diffLines.map((line, index) => (
                      <div
                        className={`git-diff-line ${line.kind}`}
                        key={`${index}:${line.text}`}
                      >
                        <span className="git-line-number">{line.oldLine ?? ""}</span>
                        <span className="git-line-number">{line.newLine ?? ""}</span>
                        <code>{line.text || " "}</code>
                      </div>
                    ))}
                  </div>
                  {diff.truncated && (
                    <div className="tool-hint">{t("git.diffTruncated")}</div>
                  )}
                </>
              )
            ) : (
              <div className="git-overview">
                <div className="git-overview-header">
                  <strong>{clean ? t("git.clean") : t("git.select")}</strong>
                  {repository?.head.oid && (
                    <code>{repository.head.oid.slice(0, 12)}</code>
                  )}
                </div>
              </div>
            )}
          </>
        ) : selectedCommitOid ? (
          <>
            <div className="tool-pane-toolbar git-commit-toolbar">
              <button
                type="button"
                className="ghost compact git-commit-back"
                onClick={() => {
                  if (selectedCommitFile) {
                    setSelectedCommitFile(null);
                  } else {
                    setSelectedCommitOid(null);
                    setSelectedCommit(null);
                  }
                }}
              >
                ← {selectedCommitFile
                  ? t("git.commitDiffBack")
                  : t("git.commitBack")}
              </button>
              <strong title={selectedCommitFile ?? selectedCommit?.subject ?? ""}>
                {selectedCommitFile
                  ? basename(selectedCommitFile)
                  : selectedCommit?.subject ?? selectedCommitOid.slice(0, 12)}
              </strong>
              <code>{selectedCommitOid.slice(0, 12)}</code>
            </div>

            {selectedCommitFile ? (
              commitDiffError ? (
                <div className="tool-inline-error">{commitDiffError}</div>
              ) : commitDiffLoading ? (
                <div className="tool-empty">{t("git.commitDiffLoading")}</div>
              ) : commitDiffBinary ? (
                <div className="tool-empty">{t("git.binaryDiff")}</div>
              ) : commitDiff !== null ? (
                <>
                  <div className="git-diff-content" tabIndex={0}>
                    {commitDiffLines.length === 0 ? (
                      <div className="tool-empty">{t("git.noDiff")}</div>
                    ) : commitDiffLines.map((line, index) => (
                      <div
                        className={`git-diff-line ${line.kind}`}
                        key={`commit:${index}:${line.text}`}
                      >
                        <span className="git-line-number">{line.oldLine ?? ""}</span>
                        <span className="git-line-number">{line.newLine ?? ""}</span>
                        <code>{line.text || " "}</code>
                      </div>
                    ))}
                  </div>
                  {commitDiffTruncated && (
                    <div className="tool-hint">{t("git.commitDiffTruncated")}</div>
                  )}
                </>
              ) : null
            ) : commitError ? (
              <div className="tool-inline-error">{commitError}</div>
            ) : commitLoading ? (
              <div className="tool-empty">{t("git.historyLoading")}</div>
            ) : selectedCommit ? (
              <div className="git-commit-detail">
                <div className="git-commit-meta">
                  <strong>{selectedCommit.subject}</strong>
                  <span>{selectedCommit.author} &lt;{selectedCommit.email}&gt;</span>
                  <span>{selectedCommit.authoredAt}</span>
                </div>
                {selectedCommit.body.trim() && (
                  <div className="git-commit-body">
                    <strong>{t("git.commitBody")}</strong>
                    <pre>{selectedCommit.body}</pre>
                  </div>
                )}
                <div className="git-group-heading">
                  <strong>{t("git.commitFiles")}</strong>
                  <span>{selectedCommit.files.length}</span>
                </div>
                {selectedCommit.files.length === 0 ? (
                  <div className="tool-empty">{t("git.commitNoFiles")}</div>
                ) : (
                  <div className="git-commit-files">
                    {selectedCommit.files.map((file) => (
                      <button
                        type="button"
                        className="git-commit-file"
                        key={`${file.status}:${file.originalPath ?? ""}:${file.path}`}
                        onClick={() => setSelectedCommitFile(file.path)}
                      >
                        <span className="git-status-code">
                          {COMMIT_STATUS_CODES[file.status]}
                        </span>
                        <span className="git-change-path" title={file.path}>
                          {file.path}
                          {file.originalPath && (
                            <small>{file.originalPath} →</small>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedCommit.truncated && (
                  <div className="tool-hint">{t("git.commitTruncated")}</div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="tool-empty">{t("git.selectCommit")}</div>
        )}
      </div>

      {trustConfirmOpen && (
        <ConfirmDialog
          title={t("git.enableWritesTitle")}
          message={t("git.enableWritesConfirm")}
          confirmLabel={t("git.enableWrites")}
          onCancel={() => setTrustConfirmOpen(false)}
          onConfirm={() => {
            setTrustConfirmOpen(false);
            onEnableWrites();
          }}
        />
      )}

      {restoreConfirm && (
        <ConfirmDialog
          title={t("git.restoreTitle")}
          message={t("git.restoreConfirm", { path: restoreConfirm.path })}
          confirmLabel={t("git.restore")}
          danger
          busy={busy}
          onCancel={() => setRestoreConfirm(null)}
          onConfirm={() => {
            const current = restoreConfirm;
            setRestoreConfirm(null);
            void runMutation({
              type: "restore",
              path: current.path,
              diffSnapshot: current.snapshot
            });
          }}
        />
      )}
    </section>
  );
}
