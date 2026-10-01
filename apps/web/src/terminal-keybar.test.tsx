import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n.js";
import { TerminalKeyBar } from "./TerminalKeyBar.js";

function markup(moreOpen: boolean): string {
  vi.stubGlobal("window", { localStorage: { getItem: () => "zh-CN" } });
  vi.stubGlobal("navigator", { language: "zh-CN" });
  const keybar = createElement(TerminalKeyBar, {
    connected: true, ctrl: false, alt: false, moreOpen,
    onFocusKeyboard: () => undefined,
    onToggleCtrl: () => undefined,
    onToggleAlt: () => undefined,
    onToggleMore: () => undefined,
    onSendKey: () => undefined,
    onSendData: () => undefined,
    onLongInput: () => undefined,
    fontSize: 14,
    onDecreaseFontSize: () => undefined,
    onIncreaseFontSize: () => undefined
  });
  return renderToStaticMarkup(createElement(I18nProvider, null, keybar));
}

describe("mobile CLI keybar", () => {
  it("keeps Long Text second and More directly available without hide mode", () => {
    const html = markup(false);
    const buttons = html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
    expect(buttons[0]).toContain("⌨");
    expect(buttons[1]).toContain("长文本");
    expect(buttons.some(button => button.includes("更多"))).toBe(true);
    expect(html).not.toContain("隐藏工具栏");
    expect(html).not.toContain('id="terminal-keybar-more"');
  });
  it("opens advanced keys directly without an intermediate full mode", () => {
    const html = markup(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="terminal-keybar-more"');
    expect(html).toContain("收起");
    expect(html).toContain("Ctrl+C");
    expect(html).toContain("A−");
  });
});
