import { useI18n } from "./i18n.js";
import {
  encodeControlShortcut,
  encodeTerminalKey,
  type TerminalKey
} from "./terminal-key-input.js";

const SHORTCUTS = {
  ctrlA: encodeControlShortcut("A"),
  ctrlC: encodeControlShortcut("C"),
  ctrlD: encodeControlShortcut("D"),
  ctrlE: encodeControlShortcut("E"),
  ctrlG: encodeControlShortcut("G"),
  ctrlJ: encodeControlShortcut("J"),
  ctrlK: encodeControlShortcut("K"),
  ctrlL: encodeControlShortcut("L"),
  ctrlO: encodeControlShortcut("O"),
  ctrlR: encodeControlShortcut("R"),
  ctrlU: encodeControlShortcut("U"),
  ctrlW: encodeControlShortcut("W")
} as const;

export function TerminalKeyBar({
  connected,
  ctrl,
  alt,
  moreOpen,
  onFocusKeyboard,
  onToggleCtrl,
  onToggleAlt,
  onToggleMore,
  onSendKey,
  onSendData,
  onLongInput
}: {
  connected: boolean;
  ctrl: boolean;
  alt: boolean;
  moreOpen: boolean;
  onFocusKeyboard(): void;
  onToggleCtrl(): void;
  onToggleAlt(): void;
  onToggleMore(): void;
  onSendKey(key: TerminalKey): void;
  onSendData(data: string): void;
  onLongInput(): void;
}) {
  const { t } = useI18n();

  const keyButton = (
    label: string,
    key: TerminalKey,
    ariaLabel = label
  ) => (
    <button
      type="button"
      disabled={!connected}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => onSendKey(key)}
    >
      {label}
    </button>
  );

  const shortcutButton = (label: string, data: string) => (
    <button
      type="button"
      disabled={!connected}
      aria-label={label}
      title={label}
      onClick={() => onSendData(data)}
    >
      {label}
    </button>
  );

  return (
    <div className="keybar glass-panel" aria-label={t("terminal.specialKeys")}>
      <div className="keybar-row">
        <button
          type="button"
          disabled={!connected}
          title={t("terminal.keyboard")}
          aria-label={t("terminal.keyboard")}
          onClick={onFocusKeyboard}
        >
          ⌨
        </button>
        {keyButton("Esc", "escape", t("terminal.keyEscape"))}
        {keyButton("Tab", "tab", t("terminal.keyTab"))}
        {keyButton("Enter", "enter", t("terminal.keyEnter"))}
        <button
          type="button"
          className={ctrl ? "armed" : ""}
          disabled={!connected}
          aria-pressed={ctrl}
          onClick={onToggleCtrl}
        >
          Ctrl
        </button>
        <button
          type="button"
          className={alt ? "armed" : ""}
          disabled={!connected}
          aria-pressed={alt}
          onClick={onToggleAlt}
        >
          Alt
        </button>
        <button
          type="button"
          className={moreOpen ? "armed" : ""}
          aria-expanded={moreOpen}
          aria-controls="terminal-keybar-more"
          onClick={onToggleMore}
        >
          {moreOpen ? t("terminal.lessKeys") : t("terminal.moreKeys")}
        </button>
        {keyButton("↑", "arrowUp", t("terminal.keyArrowUp"))}
        {keyButton("↓", "arrowDown", t("terminal.keyArrowDown"))}
        {keyButton("←", "arrowLeft", t("terminal.keyArrowLeft"))}
        {keyButton("→", "arrowRight", t("terminal.keyArrowRight"))}
        {shortcutButton("Ctrl+C", SHORTCUTS.ctrlC)}
        {shortcutButton("Ctrl+J", SHORTCUTS.ctrlJ)}
        {keyButton("Shift+Tab", "backTab")}
        {shortcutButton("Ctrl+D", SHORTCUTS.ctrlD)}
        <button
          type="button"
          disabled={!connected}
          onClick={onLongInput}
        >
          {t("terminal.longInput")}
        </button>
      </div>

      {moreOpen && (
        <div
          id="terminal-keybar-more"
          className="keybar-row keybar-more-row"
          aria-label={t("terminal.moreSpecialKeys")}
        >
          {keyButton("PgUp", "pageUp", t("terminal.keyPageUp"))}
          {keyButton("PgDn", "pageDown", t("terminal.keyPageDown"))}
          {keyButton("Home", "home", t("terminal.keyHome"))}
          {keyButton("End", "end", t("terminal.keyEnd"))}
          {keyButton("Bksp", "backspace", t("terminal.keyBackspace"))}
          {keyButton("Del", "delete", t("terminal.keyDelete"))}
          {shortcutButton("Ctrl+L", SHORTCUTS.ctrlL)}
          {shortcutButton("Ctrl+R", SHORTCUTS.ctrlR)}
          {shortcutButton("Ctrl+O", SHORTCUTS.ctrlO)}
          {shortcutButton("Ctrl+G", SHORTCUTS.ctrlG)}
          {shortcutButton("Ctrl+K", SHORTCUTS.ctrlK)}
          {shortcutButton("Ctrl+A", SHORTCUTS.ctrlA)}
          {shortcutButton("Ctrl+E", SHORTCUTS.ctrlE)}
          {shortcutButton("Ctrl+U", SHORTCUTS.ctrlU)}
          {shortcutButton("Ctrl+W", SHORTCUTS.ctrlW)}
        </div>
      )}
    </div>
  );
}
