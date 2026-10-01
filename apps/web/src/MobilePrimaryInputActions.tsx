import { useI18n } from "./i18n.js";

/** The same keyboard / long-text order in Terminal and Remote App docks. */
export function MobilePrimaryInputActions({
  keyboardDisabled = false,
  textDisabled = false,
  keyboardActive,
  textActive,
  onKeyboard,
  onLongText
}: {
  keyboardDisabled?: boolean;
  textDisabled?: boolean;
  keyboardActive?: boolean;
  textActive?: boolean;
  onKeyboard(): void;
  onLongText(): void;
}) {
  const { t } = useI18n();
  return (
    <>
      <button type="button" className={keyboardActive ? "selected compact" : "compact"}
        disabled={keyboardDisabled} aria-label={t("terminal.keyboard")}
        title={t("terminal.keyboard")}
        aria-pressed={keyboardActive}
        onClick={onKeyboard}>⌨</button>
      <button type="button" className={textActive ? "selected compact" : "compact"}
        disabled={textDisabled}
        aria-pressed={textActive}
        onClick={onLongText}>{t("terminal.longInput")}</button>
    </>
  );
}
