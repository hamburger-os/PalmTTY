export type ModalDialogHandle = Pick<HTMLDialogElement, "open" | "showModal">;

export function ensureModalDialogOpen(dialog: ModalDialogHandle): void {
  if (!dialog.open) dialog.showModal();
}
