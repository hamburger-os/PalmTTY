import { describe, expect, it } from "vitest";
import { ensureModalDialogOpen, type ModalDialogHandle } from "./dialog-controller.js";

describe("modal dialog activation", () => {
  it("is idempotent across repeated effect setup", () => {
    let open = false;
    let showCalls = 0;
    const dialog = {
      get open() {
        return open;
      },
      showModal() {
        showCalls += 1;
        open = true;
      }
    } as ModalDialogHandle;

    ensureModalDialogOpen(dialog);
    ensureModalDialogOpen(dialog);

    expect(showCalls).toBe(1);
    expect(dialog.open).toBe(true);
  });
});
