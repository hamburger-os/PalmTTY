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
import { useI18n } from "./i18n.js";

type Props = {
  capabilities: RuntimeCapabilities;
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const canChooseWsl =
    capabilities.runtimes.wsl || workspace?.runtime.kind === "wsl";

  const shellPlaceholder = useMemo(() => {
    if (kind === "wsl") return t("workspace.shellWsl");
    return capabilities.platform === "win32"
      ? t("workspace.shellHostWindows")
      : t("workspace.shellHostUnix");
  }, [capabilities.platform, kind, t]);

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
    <dialog
      ref={dialogRef}
      className="workspace-dialog"
      aria-labelledby="workspace-dialog-title"
      onCancel={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClose();
      }}
      onClose={onClose}
    >
      <form className="workspace-form" onSubmit={(event) => void submit(event)}>
        <div className="dialog-heading">
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

        <label>
          <span>{t("workspace.name")}</span>
          <input
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
              value={distribution}
              onChange={(event) => setDistribution(event.target.value)}
              placeholder={t("workspace.distributionPlaceholder")}
              maxLength={128}
            />
            <small>{t("workspace.distributionOptional")}</small>
          </label>
        )}

        <label>
          <span>{t("workspace.cwd")}</span>
          <input
            value={cwd}
            onChange={(event) => setCwd(event.target.value)}
            placeholder={
              kind === "wsl"
                ? t("workspace.cwdWslPlaceholder")
                : t("workspace.cwdHostPlaceholder")
            }
            required
          />
        </label>

        <label>
          <span>{t("workspace.shell")}</span>
          <input
            value={shell}
            onChange={(event) => setShell(event.target.value)}
            placeholder={shellPlaceholder}
          />
          <small>{t("workspace.shellOptional")}</small>
        </label>

        <label>
          <span>{t("workspace.shellArgs")}</span>
          <textarea
            value={shellArgs}
            onChange={(event) => setShellArgs(event.target.value)}
            placeholder={t("workspace.shellArgsPlaceholder")}
            rows={2}
          />
          <small>{t("workspace.shellArgsHelp")}</small>
        </label>

        <label>
          <span>{t("workspace.startupCommand")}</span>
          <input
            value={startupCommand}
            onChange={(event) => setStartupCommand(event.target.value)}
            placeholder={t("workspace.startupPlaceholder")}
            maxLength={8192}
          />
          <small>{t("workspace.startupOptional")}</small>
        </label>

        {error && <div className="error-banner">{error}</div>}

        <div className="dialog-actions">
          {workspace && onDelete ? (
            <button
              type="button"
              className="danger-outline"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("workspaces.deleteConfirm"))) return;
                void onDelete();
              }}
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
            <button type="submit" disabled={busy || !name.trim() || !cwd.trim()}>
              {busy ? t("workspace.saving") : t("workspace.save")}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
