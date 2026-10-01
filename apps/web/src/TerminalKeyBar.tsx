import { useI18n } from "./i18n.js";
import { nextTerminalDockMode, type TerminalDockMode } from "./terminal-dock.js";
import {
  encodeControlShortcut,
  type TerminalKey
} from "./terminal-key-input.js";
import {
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE
} from "./terminal-preferences.js";

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
  dockMode,
  onChangeDockMode,
  onFocusKeyboard,
  onToggleCtrl,
  onToggleAlt,
  onToggleMore,
  onSendKey,
  onSendData,
  onLongInput,
  fontSize,
  onDecreaseFontSize,
  onIncreaseFontSize
}: {
  connected: boolean;
  ctrl: boolean;
  alt: boolean;
  moreOpen: boolean;
  dockMode: TerminalDockMode;
  onChangeDockMode(mode: TerminalDockMode): void;
  onFocusKeyboard(): void;
  onToggleCtrl(): void;
  onToggleAlt(): void;
  onToggleMore(): void;
  onSendKey(key: TerminalKey): void;
  onSendData(data: string): void;
  onLongInput(): void;
  fontSize: number;
  onDecreaseFontSize(): void;
  onIncreaseFontSize(): void;
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

  if (dockMode === "hidden") {
    return (
      <div className="keybar keybar-hidden glass-panel"
        aria-label={t("terminal.specialKeys")}>
        <button type="button" className="keybar-restore"
          aria-label={t("terminal.showTools")}
          onClick={() => onChangeDockMode(nextTerminalDockMode(dockMode, "show"))}>
          ⌃ {t("terminal.showTools")}
        </button>
      </div>
    );
  }

  return (
    <div className={"keybar glass-panel keybar-" + dockMode}
      aria-label={t("terminal.specialKeys")}>
      <div className="keybar-main">
        <div className="keybar-row">
          <button type="button" disabled={!connected}
            title={t("terminal.keyboard")} aria-label={t("terminal.keyboard")}
            onClick={onFocusKeyboard}>⌨</button>
          {keyButton("Esc", "escape", t("terminal.keyEscape"))}
          {keyButton("Tab", "tab", t("terminal.keyTab"))}
          {keyButton("Enter", "enter", t("terminal.keyEnter"))}
          {shortcutButton("/", "/")}
          <button type="button" className={ctrl ? "armed" : ""}
            disabled={!connected} aria-pressed={ctrl} onClick={onToggleCtrl}>Ctrl</button>
          {dockMode === "full" && (
            <>
              <button type="button" className={alt ? "armed" : ""}
                disabled={!connected} aria-pressed={alt} onClick={onToggleAlt}>Alt</button>
              <button type="button" disabled={fontSize <= MIN_TERMINAL_FONT_SIZE}
                aria-label={t("terminal.fontSmaller")} title={t("terminal.fontSmaller")}
                onClick={onDecreaseFontSize}>A−</button>
              <button type="button" disabled={fontSize >= MAX_TERMINAL_FONT_SIZE}
                aria-label={t("terminal.fontLarger")} title={t("terminal.fontLarger")}
                onClick={onIncreaseFontSize}>A+</button>
              {keyButton("↑", "arrowUp", t("terminal.keyArrowUp"))}
              {keyButton("↓", "arrowDown", t("terminal.keyArrowDown"))}
              {keyButton("←", "arrowLeft", t("terminal.keyArrowLeft"))}
              {keyButton("→", "arrowRight", t("terminal.keyArrowRight"))}
              {shortcutButton("Ctrl+C", SHORTCUTS.ctrlC)}
              {shortcutButton("Ctrl+J", SHORTCUTS.ctrlJ)}
              {keyButton("Shift+Tab", "backTab")}
              {shortcutButton("Ctrl+D", SHORTCUTS.ctrlD)}
              <button type="button" disabled={!connected}
                onClick={onLongInput}>{t("terminal.longInput")}</button>
            </>
          )}
        </div>
        <div className="keybar-pinned">
          {dockMode === "full" && (
            <button type="button" className={moreOpen ? "armed" : ""}
              aria-expanded={moreOpen} aria-controls="terminal-keybar-more"
              onClick={onToggleMore}>
              {moreOpen ? t("terminal.lessKeys") : t("terminal.moreKeys")}
            </button>
          )}
          <button type="button"
            aria-label={dockMode === "full" ? t("terminal.compactKeys") : t("terminal.fullKeys")}
            onClick={() => onChangeDockMode(nextTerminalDockMode(dockMode, "toggle"))}>
            {dockMode === "full" ? "⌄" : "⋯"}
          </button>
          <button type="button" aria-label={t("terminal.hideTools")}
            title={t("terminal.hideTools")}
            onClick={() => onChangeDockMode(nextTerminalDockMode(dockMode, "hide"))}>−</button>
        </div>
      </div>
      {dockMode === "full" && moreOpen && (
        <div id="terminal-keybar-more" className="keybar-row keybar-more-row"
          aria-label={t("terminal.moreSpecialKeys")}>
          {shortcutButton("\\", "\\")}
          {shortcutButton("|", "|")}
          {shortcutButton("~", "~")}
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
