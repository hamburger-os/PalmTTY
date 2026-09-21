import { useI18n } from "./i18n.js";
import {
  PERFORMANCE_MODES,
  THEMES,
  useTheme,
  type ThemeId,
  type VisualPerformanceMode
} from "./theme.js";

export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const {
    theme,
    setTheme,
    performanceMode,
    setPerformanceMode,
    reducedMotion
  } = useTheme();

  return (
    <div className={`appearance-controls${compact ? " compact" : ""}`}>
      <label className="appearance-control">
        <span className="sr-only">{t("appearance.theme")}</span>
        <select
          className="glass-input glass-select"
          aria-label={t("appearance.theme")}
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemeId)}
        >
          {THEMES.map((id) => (
            <option value={id} key={id}>
              {t(`appearance.theme.${id}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="appearance-control">
        <span className="sr-only">{t("appearance.performance")}</span>
        <select
          className="glass-input glass-select"
          aria-label={t("appearance.performance")}
          value={performanceMode}
          onChange={(event) =>
            setPerformanceMode(event.target.value as VisualPerformanceMode)
          }
        >
          {PERFORMANCE_MODES.map((mode) => (
            <option value={mode} key={mode}>
              {t(`appearance.performance.${mode}`)}
            </option>
          ))}
        </select>
      </label>

      {reducedMotion && (
        <span className="motion-hint" title={t("appearance.reducedMotion")}>
          {t("appearance.reducedMotionShort")}
        </span>
      )}
    </div>
  );
}
