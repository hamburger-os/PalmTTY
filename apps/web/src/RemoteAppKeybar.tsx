import { useI18n } from "./i18n.js";
import { MobilePrimaryInputActions } from "./MobilePrimaryInputActions.js";

export function RemoteAppKeybar({
  active, controlReady, keyboardOpen, textOpen, moreKeysOpen,
  ctrl, alt, shift, onKeyboard, onLongText, onToggleCtrl,
  onToggleAlt, onToggleShift, onSendKey, onToggleMore
}: {
  active: boolean;
  controlReady: boolean;
  keyboardOpen: boolean;
  textOpen: boolean;
  moreKeysOpen: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  onKeyboard(): void;
  onLongText(): void;
  onToggleCtrl(): void;
  onToggleAlt(): void;
  onToggleShift(): void;
  onSendKey(key: string): void;
  onToggleMore(): void;
}) {
  const { t } = useI18n();
  return (
    <div className="remote-app-keybar-shell glass-panel">
      <div className="remote-app-keybar" aria-label={t("remoteApp.keys")}>
        <MobilePrimaryInputActions keyboardDisabled={!active || (!controlReady && !keyboardOpen)}
          textDisabled={!active} keyboardActive={keyboardOpen} textActive={textOpen}
          onKeyboard={onKeyboard} onLongText={onLongText} />
        <button type="button" aria-pressed={ctrl}
          className={ctrl ? "selected compact" : "compact"}
          onClick={onToggleCtrl}>Ctrl</button>
        <button type="button" aria-pressed={alt}
          className={alt ? "selected compact" : "compact"}
          onClick={onToggleAlt}>Alt</button>
        <button type="button" aria-pressed={shift}
          className={shift ? "selected compact" : "compact"}
          onClick={onToggleShift}>Shift</button>
        {([["Escape", "Esc"], ["Tab", "Tab"], ["Enter", "Enter"]] as const)
          .map(([key, label]) => (
            <button key={key} type="button" className="compact"
              onClick={() => onSendKey(key)}>{label}</button>
          ))}
      </div>
      <button type="button"
        className={moreKeysOpen ? "selected compact remote-app-more-keys" : "compact remote-app-more-keys"}
        aria-expanded={moreKeysOpen} aria-controls="remote-app-extra-keys"
        onClick={onToggleMore}>
        {moreKeysOpen ? t("remoteApp.fewerKeys") : t("remoteApp.moreKeys")}
      </button>
    </div>
  );
}
