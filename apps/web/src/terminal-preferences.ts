export const TERMINAL_FONT_SIZE_STORAGE_KEY = "palmtty.terminalFontSize";
export const MIN_TERMINAL_FONT_SIZE = 11;
export const DEFAULT_TERMINAL_FONT_SIZE = 14;
export const MAX_TERMINAL_FONT_SIZE = 18;

export type TerminalPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeTerminalFontSize(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_TERMINAL_FONT_SIZE;
  return Math.min(
    MAX_TERMINAL_FONT_SIZE,
    Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(parsed))
  );
}

export function readTerminalFontSize(
  storage: TerminalPreferenceStorage
): number {
  try {
    return normalizeTerminalFontSize(
      storage.getItem(TERMINAL_FONT_SIZE_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
}

export function writeTerminalFontSize(
  storage: TerminalPreferenceStorage,
  value: number
): void {
  try {
    storage.setItem(
      TERMINAL_FONT_SIZE_STORAGE_KEY,
      String(normalizeTerminalFontSize(value))
    );
  } catch {
    // Browser storage can be unavailable in private/restricted contexts.
  }
}
