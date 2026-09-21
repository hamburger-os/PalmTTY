import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { ITheme } from "@xterm/xterm";

export type ThemeId = "spectrum" | "obsidian" | "frosted";
export type VisualPerformanceMode = "quality" | "performance";

const THEME_STORAGE_KEY = "palmtty.theme";
const PERFORMANCE_STORAGE_KEY = "palmtty.visual-performance";
const DEFAULT_THEME: ThemeId = "spectrum";
const DEFAULT_PERFORMANCE: VisualPerformanceMode = "quality";

export const THEMES: readonly ThemeId[] = ["spectrum", "obsidian", "frosted"];
export const PERFORMANCE_MODES: readonly VisualPerformanceMode[] = [
  "quality",
  "performance"
];

function isTheme(value: string | null): value is ThemeId {
  return value === "spectrum" || value === "obsidian" || value === "frosted";
}

function isPerformanceMode(value: string | null): value is VisualPerformanceMode {
  return value === "quality" || value === "performance";
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The current page still keeps the selected appearance in memory.
  }
}

function storedTheme(): ThemeId {
  const value = readStorage(THEME_STORAGE_KEY);
  return isTheme(value) ? value : DEFAULT_THEME;
}

function storedPerformanceMode(): VisualPerformanceMode {
  const value = readStorage(PERFORMANCE_STORAGE_KEY);
  return isPerformanceMode(value) ? value : DEFAULT_PERFORMANCE;
}

function applyDocumentAppearance(
  theme: ThemeId,
  performanceMode: VisualPerformanceMode
): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.performance = performanceMode;
}

function applyDocumentMotionState(reducedMotion: boolean): void {
  document.documentElement.dataset.motion = document.hidden
    ? "paused"
    : reducedMotion
      ? "reduced"
      : "full";
}

export function initializeThemeDocument(): void {
  applyDocumentAppearance(storedTheme(), storedPerformanceMode());
  applyDocumentMotionState(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const TERMINAL_THEMES: Record<ThemeId, ITheme> = {
  spectrum: {
    background: "#0b0e12",
    foreground: "#f1f4f8",
    cursor: "#ffffff",
    cursorAccent: "#0b0e12",
    selectionBackground: "#0b8aff55",
    black: "#11161c",
    red: "#fe5b58",
    green: "#34d399",
    yellow: "#f4ba00",
    blue: "#3aa2ff",
    magenta: "#c58cff",
    cyan: "#39d0cf",
    white: "#d9e1ea",
    brightBlack: "#66717e",
    brightRed: "#ff7b78",
    brightGreen: "#63e6ae",
    brightYellow: "#ffd35a",
    brightBlue: "#70bcff",
    brightMagenta: "#d9a9ff",
    brightCyan: "#78e4e2",
    brightWhite: "#ffffff"
  },
  obsidian: {
    background: "#040506",
    foreground: "#eef1f5",
    cursor: "#ffffff",
    cursorAccent: "#040506",
    selectionBackground: "#0b8aff48",
    black: "#090b0d",
    red: "#ff6460",
    green: "#2fd18c",
    yellow: "#e9b300",
    blue: "#359cff",
    magenta: "#b985ff",
    cyan: "#37c7c7",
    white: "#d2d8df",
    brightBlack: "#5e6670",
    brightRed: "#ff817e",
    brightGreen: "#5ee6ad",
    brightYellow: "#ffd35a",
    brightBlue: "#72bdff",
    brightMagenta: "#d0a5ff",
    brightCyan: "#75dfdf",
    brightWhite: "#ffffff"
  },
  frosted: {
    background: "#f6f8fb",
    foreground: "#1b2b3d",
    cursor: "#0b72d5",
    cursorAccent: "#f6f8fb",
    selectionBackground: "#0b8aff33",
    black: "#263442",
    red: "#c84642",
    green: "#138a52",
    yellow: "#9a6d00",
    blue: "#0b72d5",
    magenta: "#8154b3",
    cyan: "#167d86",
    white: "#e6ebf1",
    brightBlack: "#637180",
    brightRed: "#de5d58",
    brightGreen: "#22a96b",
    brightYellow: "#b88400",
    brightBlue: "#238ee8",
    brightMagenta: "#9869c9",
    brightCyan: "#2499a4",
    brightWhite: "#ffffff"
  }
};

type ThemeContextValue = {
  theme: ThemeId;
  setTheme(theme: ThemeId): void;
  performanceMode: VisualPerformanceMode;
  setPerformanceMode(mode: VisualPerformanceMode): void;
  reducedMotion: boolean;
  terminalTheme: ITheme;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(storedTheme);
  const [performanceMode, setPerformanceModeState] =
    useState<VisualPerformanceMode>(storedPerformanceMode);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    applyDocumentAppearance(theme, performanceMode);
  }, [performanceMode, theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const applyMotionState = () => {
      setReducedMotion(media.matches);
      applyDocumentMotionState(media.matches);
    };

    applyMotionState();
    document.addEventListener("visibilitychange", applyMotionState);
    media.addEventListener?.("change", applyMotionState);

    return () => {
      document.removeEventListener("visibilitychange", applyMotionState);
      media.removeEventListener?.("change", applyMotionState);
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && isTheme(event.newValue)) {
        setThemeState(event.newValue);
      }
      if (
        event.key === PERFORMANCE_STORAGE_KEY &&
        isPerformanceMode(event.newValue)
      ) {
        setPerformanceModeState(event.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme(next) {
      setThemeState(next);
      writeStorage(THEME_STORAGE_KEY, next);
    },
    performanceMode,
    setPerformanceMode(next) {
      setPerformanceModeState(next);
      writeStorage(PERFORMANCE_STORAGE_KEY, next);
    },
    reducedMotion,
    terminalTheme: TERMINAL_THEMES[theme]
  }), [performanceMode, reducedMotion, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
