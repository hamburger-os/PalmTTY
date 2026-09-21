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
  WorkspacePublic
} from "@palmtty/protocol";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { DirectoryPicker } from "./DirectoryPicker.js";
import { ensureModalDialogOpen } from "./dialog-controller.js";
import { useI18n } from "./i18n.js";
import {
  STARTUP_COMMAND_PRESETS,
  shellArgumentPresets
} from "./workspace-presets.js";

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
  const [distribution, setDistribution] = useState(
    workspace?.runtime.kind === "wsl"
      ? workspace.runtime.distribution ?? ""
      : ""
  );
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

  const argumentPresets = shellArgumentPresets(
    kind,
    capabilities?.platform ?? null
  );

  const shellPlaceholder = useMemo(() => {
    if (kind === "wsl") return t("workspace.shellWsl");
    if (!capabilities) return t("workspace.shellHostGeneric");
    return capabilities.platform === "win32"
      ? t("workspace.shellHostWindows")
      : t("workspace.shellHostUnix");
  }, [capabilities, kind, t]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const args = shellArgs
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);

    const input: CreateWorkspaceInput = {
      name: name.trim(),
      cwd: cwd.trim(),
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
            onChange={(event) => setKind(event.target.value as "host" | "wsl")}
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
              onChange={(event) => setDistribution(event.target.value)}
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

        <label>
          <span>{t("workspace.shell")}</span>
          <input
            className="glass-input"
            value={shell}
            onChange={(event) => setShell(event.target.value)}
            placeholder={shellPlaceholder}
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
          <div className="preset-row" aria-label={t("workspace.shellArgsExamples")}>
            <span className="preset-caption">{t("workspace.shellArgsExamples")}</span>
            {argumentPresets.map((preset) => (
              <button
                type="button"
                className="chip"
                key={preset.id}
                onClick={() => {
                  if (preset.shell) setShell(preset.shell);
                  setShellArgs(preset.args.join("\n"));
                }}
              >
                {preset.id === "pwsh-default"
                  ? t("workspace.shellPresetPwshDefault")
                  : preset.id === "pwsh-clean"
                    ? t("workspace.shellPresetPwshClean")
                    : preset.id === "cmd-quiet"
                      ? t("workspace.shellPresetCmdQuiet")
                      : t("workspace.shellPresetLogin")}
              </button>
            ))}
            {shellArgs && (
              <button
                type="button"
                className="chip"
                onClick={() => setShellArgs("")}
              >
                {t("workspace.clear")}
              </button>
            )}
          </div>
        </div>

        <div className="workspace-field">
          <label htmlFor="workspace-startup-command">{t("workspace.startupCommand")}</label>
          <input
            className="glass-input"
            id="workspace-startup-command"
            value={startupCommand}
            onChange={(event) => setStartupCommand(event.target.value)}
            placeholder={t("workspace.startupPlaceholder")}
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
