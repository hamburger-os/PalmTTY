import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  GitBranch,
  GitCommitSummary,
  GitDiffResponse,
  GitMutationOperation,
  GitStatusResponse,
  GitChange
} from "@palmtty/protocol";
import {
  ApiError,
  workspaceGitBranches,
  workspaceGitDiff,
  workspaceGitHistory,
  workspaceGitMutate,
  workspaceGitRemote,
  workspaceGitStatus
} from "./api.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
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

const STATUS_CODES: Record<string, string> = {
  modified: "M",
  typeChanged: "T",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  unmerged: "U"
};

function statusCode(entry: GitChange, staged: boolean): string {
  if (entry.untracked) return "?";
  const value = staged ? entry.indexStatus : entry.worktreeStatus;
  return value ? (STATUS_CODES[value] ?? "·") : "·";
}

export function GitPane({ workspaceId }: { workspaceId: string }) {
  const { t, error: translateError } = useI18n();
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [history, setHistory] = useState<GitCommitSummary[]>([]);
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [diff, setDiff] = useState<GitDiffResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [trustConfirmOpen, setTrustConfirmOpen] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<RestoreConfirmation>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchSelection, setBranchSelection] = useState("");

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

  const loadRepositoryMetadata = useCallback(async () => {
    try {
      const [historyResult, branchResult] = await Promise.all([
        workspaceGitHistory(workspaceId, 20),
        workspaceGitBranches(workspaceId)
      ]);
      setHistory(historyResult.commits);
      setBranches(branchResult.branches);
      const current = branchResult.branches.find((item) => item.current);
      setBranchSelection(current?.name ?? "");
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : "git_unavailable";
      setActionError(translateError(code));
    }
  }, [translateError, workspaceId]);

  const refreshAll = useCallback(async (showLoading = false) => {
    const result = await loadStatus(showLoading);
    if (result?.available) {
      await loadRepositoryMetadata();
    } else {
      setHistory([]);
      setBranches([]);
    }
  }, [loadRepositoryMetadata, loadStatus]);

  useEffect(() => {
    void refreshAll(true);
  }, [refreshAll]);

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

  const runMutation = useCallback(async (operation: GitMutationOperation) => {
    const repository = status?.repository;
    if (!repository || busy || !writesEnabled) return;
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
      await loadRepositoryMetadata();
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
    loadRepositoryMetadata,
    refreshAll,
    status?.repository,
    translateError,
    workspaceId,
    writesEnabled
  ]);

  const runRemote = useCallback(async (operation: "fetch" | "pull" | "push") => {
    const repository = status?.repository;
    if (!repository || busy || !writesEnabled) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await workspaceGitRemote(workspaceId, {
        expectedState: repository.stateToken,
        allowRepositoryCodeExecution: true,
        operation
      });
      applyStatus(result.status);
      await loadRepositoryMetadata();
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
    loadRepositoryMetadata,
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

  const diffLines = useMemo(
    () => parseUnifiedDiff(diff?.diff ?? ""),
    [diff?.diff]
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
                  disabled={!writesEnabled || busy}
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

  return (
    <section className={`git-pane tool-pane glass-content${selection ? " has-preview" : ""}`}>
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
            disabled={busy}
            onClick={() => void refreshAll(true)}
          >
            {t("git.refresh")}
          </button>
        </div>

        {statusError && <div className="tool-inline-error">{statusError}</div>}
        {actionError && <div className="tool-inline-error">{actionError}</div>}

        {loading ? (
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
                  disabled={!writesEnabled || busy}
                  onClick={() => void runRemote("fetch")}
                >
                  {t("git.fetch")}
                </button>
                <button
                  type="button"
                  className="ghost compact"
                  disabled={!writesEnabled || busy}
                  onClick={() => void runRemote("pull")}
                >
                  {t("git.pull")}
                </button>
                <button
                  type="button"
                  className="ghost compact"
                  disabled={!writesEnabled || busy}
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
                  (entry) => void runMutation({ type: "stage", paths: [entry.path] })
                )}
                {renderGroup(
                  t("git.staged"),
                  staged,
                  true,
                  t("git.unstage"),
                  (entry) => void runMutation({ type: "unstage", paths: [entry.path] })
                )}
                {staged.length > 0 && (
                  <button
                    type="button"
                    className="ghost compact git-group-action"
                    disabled={!writesEnabled || busy}
                    onClick={() => void runMutation({
                      type: "unstage",
                      paths: staged.map((entry) => entry.path)
                    })}
                  >
                    {t("git.unstageAll")}
                  </button>
                )}
                {renderGroup(
                  t("git.changes"),
                  changes,
                  false,
                  t("git.stage"),
                  (entry) => void runMutation({ type: "stage", paths: [entry.path] })
                )}
                {changes.length > 0 && (
                  <button
                    type="button"
                    className="ghost compact git-group-action"
                    disabled={!writesEnabled || busy}
                    onClick={() => void runMutation({
                      type: "stage",
                      paths: changes.map((entry) => entry.path)
                    })}
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
                disabled={!writesEnabled || busy}
                onChange={(event) => setCommitMessage(event.target.value)}
              />
              <button
                type="button"
                className="primary"
                disabled={
                  !writesEnabled ||
                  busy ||
                  staged.length === 0 ||
                  commitMessage.trim().length === 0
                }
                onClick={() => void runMutation({
                  type: "commit",
                  message: commitMessage.trim(),
                  amend: false
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
                    disabled={!writesEnabled || busy || branches.length === 0}
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
                      !writesEnabled ||
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
                    disabled={!writesEnabled || busy}
                    onChange={(event) => setBranchName(event.target.value)}
                  />
                  <button
                    type="button"
                    className="ghost compact"
                    disabled={!writesEnabled || busy || !branchName.trim()}
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
                  disabled={!writesEnabled || busy || status.changes.length === 0}
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
                  disabled={!writesEnabled || busy}
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
              {selection.staged ? t("git.stagedBadge") : t("git.workingTreeBadge")}
            </span>
            {!selection.staged &&
              diff &&
              !diff.binary &&
              !diff.truncated &&
              !selectedChange?.untracked &&
              !selectedChange?.conflict && (
              <button
                type="button"
                className="danger compact"
                disabled={!writesEnabled || busy}
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
            <div className="git-history">
              <div className="git-group-heading">
                <strong>{t("git.recentCommits")}</strong>
                <span>{history.length}</span>
              </div>
              {history.length === 0 ? (
                <div className="tool-empty">{t("git.noCommits")}</div>
              ) : history.map((commit) => (
                <div className="git-history-row" key={commit.oid}>
                  <code>{commit.shortOid}</code>
                  <span>
                    <strong>{commit.subject}</strong>
                    <small>{commit.author} · {commit.authoredAt}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
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
            setWritesEnabled(true);
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
