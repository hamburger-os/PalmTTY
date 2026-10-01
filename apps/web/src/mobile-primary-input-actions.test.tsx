import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n.js";
import { MobilePrimaryInputActions } from "./MobilePrimaryInputActions.js";
import { RemoteAppKeybar } from "./RemoteAppKeybar.js";

vi.stubGlobal("window", { localStorage: { getItem: () => "zh-CN" } });
vi.stubGlobal("navigator", { language: "zh-CN" });

describe("shared mobile primary inputs", () => {
  it("always renders Keyboard then Long Text with accessible state", () => {
    const actions = createElement(MobilePrimaryInputActions, {
      keyboardDisabled: true, keyboardActive: true,
      onKeyboard: () => undefined, onLongText: () => undefined
    });
    const html = renderToStaticMarkup(createElement(I18nProvider, null, actions));
    const buttons = html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain("⌨");
    expect(buttons[0]).toContain('aria-label="键盘"');
    expect(buttons[0]).toContain('aria-pressed="true"');
    expect(buttons[0]).toContain("disabled");
    expect(buttons[1]).toContain("长文本");
    expect(buttons[1]).not.toContain("disabled");
  });

  it("pins the same two actions before modifiers in the App key dock", () => {
    const app = createElement(RemoteAppKeybar, {
      active: true, controlReady: true, keyboardOpen: false,
      textOpen: false, moreKeysOpen: false,
      ctrl: false, alt: false, shift: false,
      onKeyboard: () => undefined, onLongText: () => undefined,
      onToggleCtrl: () => undefined, onToggleAlt: () => undefined,
      onToggleShift: () => undefined, onSendKey: () => undefined,
      onToggleMore: () => undefined
    });
    const html = renderToStaticMarkup(createElement(I18nProvider, null, app));
    const buttons = html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
    expect(buttons.slice(0, 4).map((button) => button.replace(/<[^>]+>/g, "")))
      .toEqual(["⌨", "长文本", "Ctrl", "Alt"]);
    expect(html).toContain('aria-controls="remote-app-extra-keys"');
  });
});
