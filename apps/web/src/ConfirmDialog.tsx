import { useEffect, useRef } from "react";
import { ensureModalDialogOpen } from "./dialog-controller.js";
import { useI18n } from "./i18n.js";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel(): void;
  onConfirm(): void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onCancel,
  onConfirm
}: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    ensureModalDialogOpen(dialog);
    window.requestAnimationFrame(() => cancelRef.current?.focus());
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog glass-modal"
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="confirm-dialog-body">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
      </div>
      <div className="confirm-dialog-actions">
        <button
          ref={cancelRef}
          type="button"
          className="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className={danger ? "danger-solid" : "prism-primary"}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel ?? t("common.confirm")}
        </button>
      </div>
    </dialog>
  );
}
