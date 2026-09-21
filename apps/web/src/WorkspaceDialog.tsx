import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import type {
  CreateWorkspaceInput,
  RuntimeCapabilities,
  TerminalProfile,
  WorkspacePublic,
  WorkspaceRuntime
} from "@palmtty/protocol";
import { detectTerminalProfiles } from "./api.js";
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
    return `${workspace.runtime.distribution} · ${shell}`;
  }
  return `${runtime} · ${shell}`;
}

function runtimeKey(
  kind: "host" | "wsl",
  distribution: string
): string {
  return kind === "host"
    ? "host"
    : `wsl:${distribution.trim().toLowerCase() || "<default>"}`;
}

function sameArgs(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function profileMatches(
  profile: TerminalProfile,
  kind: "host" | "wsl",
  distribution: string,
  shell: string,
  args: string[]
): boolean {
  if (profile.runtime.kind !== kind) return false;
  if (!sameArgs(profile.runtime.args, args)) return false;
  if ((profile.runtime.shell ?? "") !== shell.trim()) return false;

  if (profile.runtime.kind === "wsl") {
    return (profile.runtime.distribution ?? "").toLowerCase() ===
      distribution.trim().toLowerCase();
  }
  return true;
}

function runtimeFromState(
  kind: "host" | "wsl",
  distribution: string,
  shell: string,
  args: string[]
): WorkspaceRuntime {
  return kind === "wsl"
    ? {
        kind: "wsl",
        ...(distribution.trim() ? { distribution: distribution.trim() } : {}),
        ...(shell.trim() ? { shell: shell.trim() } : {}),
        args
      }
    : {
        kind: "host",
        ...(shell.trim() ? { shell: shell.trim() } : {}),
        args
      };
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
  const [distribution, setDistribution] = useState(
    workspace?.runtime.kind === "wsl"
      ? workspace.runtime.distribution ?? ""
      : ""
  );
  const [shell, setShell] = useState(workspace?.runtime.shell ?? "");
  const [shellArgs, setShellArgs] = useState(
    workspace?.runtime.args.join("\n") ?? ""
  );
  const [profiles, setProfiles] = useState<TerminalProfile[]>([]);
  const [profileChoice, setProfileChoice] = useState("detecting");
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [environmentText, setEnvironmentText] = useState(
    formatWorkspaceEnvironment(workspace?.environment)
  );
  const [environmentError, setEnvironmentError] = useState<string | null>(null);
  const [startupCommand, setStartupCommand] = useState(
    workspace?.startupCommand ?? ""
  );
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const cwdDraftsRef = useRef(new Map<string, string>([
    [runtimeKey(kind, distribution), workspace?.cwd ?? ""]
  ]));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    ensureModalDialogOpen(dialog);
  }, []);

  const parsedShellArgs = useMemo(() => (
    shellArgs
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
  ), [shellArgs]);

  const hostProfiles = useMemo(
    () => profiles.filter((profile) => profile.runtime.kind === "host"),
    [profiles]
  );
  const wslProfiles = useMemo(
    () => profiles.filter((profile) => profile.runtime.kind === "wsl"),
    [profiles]
  );

  const applyProfile = (profile: TerminalProfile) => {
    const currentKey = runtimeKey(kind, distribution);
    cwdDraftsRef.current.set(currentKey, cwd);

    const nextKind = profile.runtime.kind;
    const nextDistribution = nextKind === "wsl"
      ? profile.runtime.distribution ?? ""
      : "";
    const nextKey = runtimeKey(nextKind, nextDistribution);

    setKind(nextKind);
    setDistribution(nextDistribution);
    setShell(profile.runtime.shell ?? "");
    setShellArgs(profile.runtime.args.join("\n"));
    setProfileChoice(profile.id);
    setDirectoryPickerOpen(false);

    if (nextKey !== currentKey) {
      setCwd(cwdDraftsRef.current.get(nextKey) ?? "");
    }
  };

  useEffect(() => {
    let cancelled = false;
    setProfilesLoading(true);
    setProfilesError(false);

    void detectTerminalProfiles()
      .then(({ profiles: detected }) => {
        if (cancelled) return;
        setProfiles(detected);

        const currentArgs = shellArgs
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean);
        const match = detected.find((profile) => profileMatches(
          profile,
          kind,
          distribution,
          shell,
          currentArgs
        ));

        if (match) {
          setProfileChoice(match.id);
          return;
        }

        if (!workspace) {
          const recommended = detected.find((profile) => profile.recommended);
          if (recommended) {
            applyProfile(recommended);
            return;
          }
        }

        setProfileChoice("custom");
      })
      .catch(() => {
        if (cancelled) return;
        setProfiles([]);
        setProfilesError(true);
        setProfileChoice("custom");
      })
      .finally(() => {
        if (!cancelled) setProfilesLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Refresh is explicitly user-driven. Current form state is intentionally
    // captured from the render that initiated this discovery request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileRefreshKey]);

  const selectProfile = (value: string) => {
    if (value === "custom") {
      setProfileChoice("custom");
      return;
    }
    const profile = profiles.find((candidate) => candidate.id === value);
    if (profile) applyProfile(profile);
  };

  const changeCustomRuntime = (nextKind: "host" | "wsl") => {
    if (nextKind === kind) return;

    const currentKey = runtimeKey(kind, distribution);
    cwdDraftsRef.current.set(currentKey, cwd);

    const nextDistribution = nextKind === "wsl" ? "" : "";
    const nextKey = runtimeKey(nextKind, nextDistribution);
    setKind(nextKind);
    setDistribution(nextDistribution);
    setShell("");
    setShellArgs("");
    setCwd(cwdDraftsRef.current.get(nextKey) ?? "");
    setDirectoryPickerOpen(false);
  };

  const changeCustomDistribution = (value: string) => {
    const currentKey = runtimeKey(kind, distribution);
    cwdDraftsRef.current.set(currentKey, cwd);

    const nextKey = runtimeKey("wsl", value);
    setDistribution(value);
    setCwd(cwdDraftsRef.current.get(nextKey) ?? "");
    setDirectoryPickerOpen(false);
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
      case "unbalanced_quotes":
        return t("workspace.environmentUnbalancedQuotes", { line: parseError.line });
      case "too_many":
        return t("workspace.environmentTooMany");
      case "value_too_long":
        return t("workspace.environmentValueTooLong", { line: parseError.line });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

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
      runtime: runtimeFromState(
        kind,
        distribution,
        shell,
        parsedShellArgs
      ),
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

            <div className="workspace-field">
              <label htmlFor="workspace-terminal-profile">
                {t("workspace.terminalProfile")}
              </label>
              <div className="workspace-input-action">
                <select
                  className="glass-input glass-select"
                  id="workspace-terminal-profile"
                  value={profileChoice}
                  disabled={profilesLoading && profileChoice === "detecting"}
                  onChange={(event) => selectProfile(event.target.value)}
                >
                  {profileChoice === "detecting" && (
                    <option value="detecting">{t("workspace.profileDetecting")}</option>
                  )}
                  {hostProfiles.length > 0 && (
                    <optgroup label={t("workspace.profileHostGroup")}>
                      {hostProfiles.map((profile) => (
                        <option value={profile.id} key={profile.id}>
                          {profile.recommended
                            ? `${profile.label} · ${t("workspace.profileRecommended")}`
                            : profile.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {wslProfiles.length > 0 && (
                    <optgroup label={t("workspace.profileWslGroup")}>
                      {wslProfiles.map((profile) => (
                        <option value={profile.id} key={profile.id}>
                          {profile.label} · WSL
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="custom">{t("workspace.profileCustom")}</option>
                </select>
                <button
                  type="button"
                  className="ghost"
                  disabled={profilesLoading}
                  onClick={() => setProfileRefreshKey((value) => value + 1)}
                >
                  {profilesLoading
                    ? t("workspace.profileDetecting")
                    : t("workspace.profileRefresh")}
                </button>
              </div>
              <small>
                {profilesError
                  ? t("workspace.profileDetectionFailed")
                  : t("workspace.terminalProfileHelp")}
              </small>
            </div>

            {profileChoice === "custom" && (
              <div className="workspace-advanced glass-content">
                <label>
                  <span>{t("workspace.customRuntime")}</span>
                  <select
                    className="glass-input glass-select"
                    value={kind}
                    onChange={(event) => changeCustomRuntime(
                      event.target.value as "host" | "wsl"
                    )}
                  >
                    <option value="host">{t("workspaces.host")}</option>
                    {(capabilities?.runtimes.wsl || kind === "wsl") && (
                      <option value="wsl">{t("workspaces.wsl")}</option>
                    )}
                  </select>
                  <small>{t("workspace.customRuntimeHelp")}</small>
                </label>

                {kind === "wsl" && (
                  <label>
                    <span>{t("workspace.distribution")}</span>
                    <input
                      className="glass-input"
                      value={distribution}
                      onChange={(event) => changeCustomDistribution(event.target.value)}
                      placeholder={t("workspace.distributionPlaceholder")}
                      maxLength={128}
                    />
                    <small>{t("workspace.distributionOptional")}</small>
                  </label>
                )}

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
                  <label htmlFor="workspace-shell-args">
                    {t("workspace.shellArgs")}
                  </label>
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
              </div>
            )}

            <div className="workspace-field">
              <label htmlFor="workspace-cwd">{t("workspace.cwd")}</label>
              <div className="workspace-input-action">
                <input
                  className="glass-input"
                  id="workspace-cwd"
                  value={cwd}
                  onChange={(event) => {
                    setCwd(event.target.value);
                    cwdDraftsRef.current.set(
                      runtimeKey(kind, distribution),
                      event.target.value
                    );
                  }}
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
              <small>
                {kind === "wsl" && !cwd.trim()
                  ? t("workspace.cwdWslRequired")
                  : t("workspace.cwdBrowseHelp")}
              </small>
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
                  cwdDraftsRef.current.set(
                    runtimeKey(kind, distribution),
                    path
                  );
                  setDirectoryPickerOpen(false);
                }}
                onClose={() => setDirectoryPickerOpen(false)}
              />
            )}

            <div className="workspace-field">
              <label htmlFor="workspace-environment">
                {t("workspace.environment")}
              </label>
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
              {environmentError && (
                <div className="field-error">{environmentError}</div>
              )}
            </div>

            <div className="workspace-field">
              <label htmlFor="workspace-startup-command">
                {t("workspace.startupCommand")}
              </label>
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
              <button
                className="prism-primary"
                type="submit"
                disabled={busy || !name.trim() || !cwd.trim()}
              >
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
