import {
  useEffect,
  useRef,
  useState,
  type FormEvent
} from "react";
import type {
  CreateWorkspaceInput,
  RuntimeCapabilities,
  ShellProfile,
  WorkspacePublic
} from "@palmtty/protocol";
import { detectShellProfiles } from "./api.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { DirectoryPicker } from "./DirectoryPicker.js";
import { ensureModalDialogOpen } from "./dialog-controller.js";
import { useI18n } from "./i18n.js";
import {
  formatWorkspaceEnvironment,
  parseWorkspaceEnvironment,
  WorkspaceEnvironmentParseError
} from "./workspace-environment.js";
import { STARTUP_COMMAND_PRESETS } from "./workspace-presets.js";

type Props = {
  capabilities: RuntimeCapabilities | null;
  workspace?: WorkspacePublic;
  busy: boolean;
  error: string | null;
  onClose(): void;
  onSave(input: CreateWorkspaceInput): Promise<void>;
  onDelete?: () => Promise<void>;
};

function runtimeLabel(
  workspace: WorkspacePublic,
  hostLabel: string,
  wslLabel: string
): string {
  return workspace.runtime.kind === "wsl" ? wslLabel : hostLabel;
}

export function workspaceRuntimeSummary(
  workspace: WorkspacePublic,
  labels: {
    host: string;
    wsl: string;
    defaultShell: string;
  }
): string {
  const runtime = runtimeLabel(workspace, labels.host, labels.wsl);
  const shell = workspace.runtime.shell ?? labels.defaultShell;
  if (workspace.runtime.kind === "wsl" && workspace.runtime.distribution) {
    return `${runtime} · ${workspace.runtime.distribution} · ${shell}`;
  }
  return `${runtime} · ${shell}`;
}

export function WorkspaceDialog({
  capabilities,
  workspace,
  busy,
  error,
  onClose,
  onSave,
  onDelete
}: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(workspace?.name ?? "");
  const [cwd, setCwd] = useState(workspace?.cwd ?? "");
  const [kind, setKind] = useState<"host" | "wsl">(
    workspace?.runtime.kind ?? "host"
  );
  const [shell, setShell] = useState(workspace?.runtime.shell ?? "");
  const [shellArgs, setShellArgs] = useState(
    workspace?.runtime.args.join("\n") ?? ""
  );
  const shellRef = useRef(shell);
  const shellArgsRef = useRef(shellArgs);
  shellRef.current = shell;
  shellArgsRef.current = shellArgs;
  const [shellProfiles, setShellProfiles] = useState<ShellProfile[]>([]);
  const [shellChoice, setShellChoice] = useState("detecting");
  const [shellProfilesLoading, setShellProfilesLoading] = useState(false);
  const [shellProfilesError, setShellProfilesError] = useState(false);
  const [shellRefreshKey, setShellRefreshKey] = useState(0);
  const [distribution, setDistribution] = useState(
    workspace?.runtime.kind === "wsl"
      ? workspace.runtime.distribution ?? ""
      : ""
  );
  const [environmentText, setEnvironmentText] = useState(
    formatWorkspaceEnvironment(workspace?.environment)
  );
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [startupCommand, setStartupCommand] = useState(
    workspace?.startupCommand ?? ""
  );
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    ensureModalDialogOpen(dialog);
  }, []);

  const canChooseWsl =
    capabilities?.runtimes.wsl || workspace?.runtime.kind === "wsl";

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setShellProfilesLoading(true);
      setShellProfilesError(false);
      void detectShellProfiles({
        kind,
        ...(kind === "wsl" && distribution.trim()
          ? { distribution: distribution.trim() }
          : {})
      }).then(({ profiles }) => {
        if (cancelled) return;
        setShellProfiles(profiles);

        const currentArgs = shellArgsRef.current
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean);
        const currentShell = shellRef.current.trim();
        const match = profiles.find((profile) => (
          profile.shell === currentShell &&
          profile.args.length === currentArgs.length &&
          profile.args.every((arg, index) => arg === currentArgs[index])
        ));

        if (match) {
          setShellChoice(match.id);
          return;
        }
        if (currentShell) {
          setShellChoice("custom");
          return;
        }

        const recommended = profiles.find((profile) => profile.recommended);
        if (recommended) {
          setShell(recommended.shell);
          setShellArgs(recommended.args.join("\n"));
          setShellChoice(recommended.id);
        } else {
          setShellChoice("custom");
        }
      }).catch(() => {
        if (cancelled) return;
        setShellProfiles([]);
        setShellProfilesError(true);
        setShellChoice("custom");
      }).finally(() => {
        if (!cancelled) setShellProfilesLoading(false);
      });
    }, kind === "wsl" ? 350 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [distribution, kind, shellRefreshKey]);

  const changeRuntime = (nextKind: "host" | "wsl") => {
    setKind(nextKind);
    setShell("");
    setShellArgs("");
    setShellChoice("detecting");
    setShellProfiles([]);
    setShellProfilesError(false);
  };

  const selectShell = (value: string) => {
    setShellChoice(value);
    if (value === "custom") {
      setShell("");
      setShellArgs("");
      return;
    }
    const profile = shellProfiles.find((candidate) => candidate.id === value);
    if (!profile) return;
    setShell(profile.shell);
    setShellArgs(profile.args.join("\n"));
  };

  const environmentErrorMessage = (
    parseError: WorkspaceEnvironmentParseError
  ): string => {
    switch (parseError.code) {
      case "missing_equals":
        return t("workspace.environmentMissingEquals", { line: parseError.line });
      case "invalid_name":
        return t("workspace.environmentInvalidName", { line: parseError.line });
      case "duplicate_name":
        return t("workspace.environmentDuplicate", { line: parseError.line });
      case "reserved_name":
        return t("workspace.environmentReserved", { line: parseError.line });
      case "too_many":
        return t("workspace.environmentTooMany");
      case "value_too_long":
        return t("workspace.environmentValueTooLong", { line: parseError.line });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const args = shellArgs
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    let environment: Record<string, string>;
    try {
      environment = parseWorkspaceEnvironment(environmentText);
      setEnvironmentError(null);
    } catch (cause) {
      if (cause instanceof WorkspaceEnvironmentParseError) {
        setEnvironmentError(environmentErrorMessage(cause));
        return;
      }
      throw cause;
    }

    const input: CreateWorkspaceInput = {
      name: name.trim(),
      cwd: cwd.trim(),
      environment: Object.keys(environment).length > 0 ? environment : undefined,
      runtime: kind === "wsl"
        ? {
            kind: "wsl",
            ...(distribution.trim()
              ? { distribution: distribution.trim() }
              : {}),
            ...(shell.trim() ? { shell: shell.trim() } : {}),
            args
          }
        : {
            kind: "host",
            ...(shell.trim() ? { shell: shell.trim() } : {}),
            args
          },
      ...(startupCommand.trim()
        ? { startupCommand: startupCommand.trim() }
        : {})
    };
    await onSave(input);
  };

  return (
    <>
    <dialog
      ref={dialogRef}
      className="workspace-dialog glass-modal"
      aria-labelledby="workspace-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form className="workspace-form" onSubmit={(event) => void submit(event)}>
        <div className="dialog-heading workspace-dialog-header">
          <h2 id="workspace-dialog-title">
            {workspace ? t("workspace.editTitle") : t("workspace.addTitle")}
          </h2>
          <button
            type="button"
            className="ghost compact icon-button"
            aria-label={t("workspace.cancel")}
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="workspace-form-body">
          <label>
            <span>{t("workspace.name")}</span>
            <input
              className="glass-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("workspace.namePlaceholder")}
              maxLength={100}
              required
              autoFocus
            />
          </label>

          <label>
            <span>{t("workspace.runtime")}</span>
            <select
              className="glass-input glass-select"
              value={kind}
              onChange={(event) => changeRuntime(event.target.value as "host" | "wsl")}
            >
              <option value="host">{t("workspaces.host")}</option>
              {canChooseWsl && (
                <option value="wsl">{t("workspaces.wsl")}</option>
              )}
            </select>
            <small>
              {kind === "wsl"
                ? t("workspace.wslHelp")
                : t("workspace.hostHelp")}
            </small>
          </label>

          {kind === "wsl" && (
            <label>
              <span>{t("workspace.distribution")}</span>
              <input
                className="glass-input"
                value={distribution}
                onChange={(event) => {
                  setDistribution(event.target.value);
                  setShell("");
                  setShellArgs("");
                  setShellChoice("detecting");
                }}
                placeholder={t("workspace.distributionPlaceholder")}
                maxLength={128}
              />
              <small>{t("workspace.distributionOptional")}</small>
            </label>
          )}

          <div className="workspace-field">
            <label htmlFor="workspace-cwd">{t("workspace.cwd")}</label>
            <div className="workspace-input-action">
              <input
                className="glass-input"
                id="workspace-cwd"
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
                placeholder={
                  kind === "wsl"
                    ? t("workspace.cwdWslPlaceholder")
                    : t("workspace.cwdHostPlaceholder")
                }
                required
              />
              <button
                type="button"
                className="ghost"
                onClick={() => setDirectoryPickerOpen((open) => !open)}
              >
                {directoryPickerOpen
                  ? t("workspace.directoryHide")
                  : t("workspace.directoryBrowse")}
              </button>
            </div>
            <small>{t("workspace.cwdBrowseHelp")}</small>
          </div>

          {directoryPickerOpen && (
            <DirectoryPicker
              key={`${kind}:${distribution.trim()}`}
              kind={kind}
              {...(kind === "wsl" && distribution.trim()
                ? { distribution: distribution.trim() }
                : {})}
              {...(cwd.trim() ? { initialPath: cwd.trim() } : {})}
              onChoose={(path) => {
                setCwd(path);
                setDirectoryPickerOpen(false);
              }}
              onClose={() => setDirectoryPickerOpen(false)}
            />
          )}

          <div className="workspace-field">
            <label htmlFor="workspace-shell-profile">{t("workspace.shellProfile")}</label>
            <div className="workspace-input-action">
              <select
                className="glass-input glass-select"
                id="workspace-shell-profile"
                value={shellChoice}
                disabled={shellProfilesLoading && shellChoice === "detecting"}
                onChange={(event) => selectShell(event.target.value)}
              >
                {shellChoice === "detecting" && (
                  <option value="detecting">{t("workspace.shellDetecting")}</option>
                )}
                {shellProfiles.map((profile) => (
                  <option value={profile.id} key={profile.id}>
                    {profile.recommended
                      ? `${profile.label} · ${t("workspace.shellRecommended")}`
                      : profile.label}
                  </option>
                ))}
                <option value="custom">{t("workspace.shellCustom")}</option>
              </select>
              <button
                type="button"
                className="ghost"
                disabled={shellProfilesLoading}
                onClick={() => setShellRefreshKey((value) => value + 1)}
              >
                {shellProfilesLoading
                  ? t("workspace.shellDetecting")
                  : t("workspace.shellRefresh")}
              </button>
            </div>
            <small>
              {shellProfilesError
                ? t("workspace.shellDetectionFailed")
                : t("workspace.shellProfileHelp")}
            </small>
          </div>

          {shellChoice === "custom" && (
            <>
              <label>
                <span>{t("workspace.shellExecutable")}</span>
                <input
                  className="glass-input"
                  value={shell}
                  onChange={(event) => setShell(event.target.value)}
                  placeholder={
                    kind === "wsl"
                      ? t("workspace.shellWsl")
                      : capabilities?.platform === "win32"
                        ? t("workspace.shellHostWindows")
                        : t("workspace.shellHostUnix")
                  }
                />
                <small>{t("workspace.shellOptional")}</small>
              </label>

              <div className="workspace-field">
                <label htmlFor="workspace-shell-args">{t("workspace.shellArgs")}</label>
                <textarea
                  className="glass-input"
                  id="workspace-shell-args"
                  value={shellArgs}
                  onChange={(event) => setShellArgs(event.target.value)}
                  placeholder={t("workspace.shellArgsPlaceholder")}
                  rows={2}
                />
                <small>{t("workspace.shellArgsHelp")}</small>
              </div>
            </>
          )}

          <div className="workspace-field">
            <label htmlFor="workspace-environment">{t("workspace.environment")}</label>
            <textarea
              className="glass-input"
              id="workspace-environment"
              value={environmentText}
              onChange={(event) => {
                setEnvironmentText(event.target.value);
                setEnvironmentError(null);
              }}
              placeholder={"HTTPS_PROXY=http://127.0.0.1:10808\nHTTP_PROXY=http://127.0.0.1:10808"}
              rows={4}
              maxLength={32768}
              aria-invalid={environmentError ? "true" : undefined}
            />
            <small>{t("workspace.environmentHelp")}</small>
            {environmentError && <div className="field-error">{environmentError}</div>}
          </div>

          <div className="workspace-field">
            <label htmlFor="workspace-startup-command">{t("workspace.startupCommand")}</label>
            <textarea
              className="glass-input"
              id="workspace-startup-command"
              value={startupCommand}
              onChange={(event) => setStartupCommand(event.target.value)}
              placeholder={t("workspace.startupPlaceholder")}
              rows={3}
              maxLength={8192}
            />
            <small>{t("workspace.startupOptional")}</small>
            <div className="preset-row" aria-label={t("workspace.agentPresets")}>
              <span className="preset-caption">{t("workspace.agentPresets")}</span>
              {STARTUP_COMMAND_PRESETS.map((preset) => (
                <button
                  type="button"
                  className="chip"
                  key={preset.id}
                  title={preset.command}
                  onClick={() => setStartupCommand(preset.command)}
                >
                  {preset.label}
                </button>
              ))}
              {startupCommand && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => setStartupCommand("")}
                >
                  {t("workspace.clear")}
                </button>
              )}
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}
        </div>

        <div className="dialog-actions workspace-dialog-footer">
          {workspace && onDelete ? (
            <button
              type="button"
              className="danger-outline"
              disabled={busy}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              {busy ? t("workspace.deleting") : t("workspace.delete")}
            </button>
          ) : <span />}

          <div className="dialog-primary-actions">
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={onClose}
            >
              {t("workspace.cancel")}
            </button>
            <button className="prism-primary" type="submit" disabled={busy || !name.trim() || !cwd.trim()}>
              {busy ? t("workspace.saving") : t("workspace.save")}
            </button>
          </div>
        </div>
      </form>
    </dialog>
      {deleteConfirmOpen && workspace && onDelete && (
        <ConfirmDialog
          title={t("workspace.deleteTitle")}
          message={t("workspaces.deleteConfirm")}
          confirmLabel={busy ? t("workspace.deleting") : t("workspace.delete")}
          danger
          busy={busy}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            void onDelete();
          }}
        />
      )}
    </>
  );
}
