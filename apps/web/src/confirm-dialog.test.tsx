import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { I18nProvider } from "./i18n.js";

function render(busy: boolean, error: string | null) {
  vi.stubGlobal("window", { localStorage: { getItem: () => "zh-CN" } });
  vi.stubGlobal("navigator", { language: "zh-CN" });
  return renderToStaticMarkup(createElement(I18nProvider, null,
    createElement(ConfirmDialog, {
      title: "清除已保留会话？",
      message: "要清理历史吗？",
      danger: true,
      busy,
      error,
      onCancel: () => undefined,
      onConfirm: () => undefined
    })
  ));
}

describe("destructive confirmation", () => {
  it("shows failures adjacent to the confirmation with an alert role", () => {
    const html = render(false, "清除失败");
    expect(html).toContain('role="alert"');
    expect(html).toContain("清除失败");
    expect(html).toContain("confirm-dialog glass-modal");
  });
  it("disables both actions during a pending mutation", () => {
    const html = render(true, null);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });
});
