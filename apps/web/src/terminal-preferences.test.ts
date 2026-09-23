import { describe, expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  normalizeTerminalFontSize,
  readTerminalFontSize,
  writeTerminalFontSize
} from "./terminal-preferences.js";

describe("terminal preferences", () => {
  it("normalizes terminal font size to the supported range", () => {
    expect(normalizeTerminalFontSize("12")).toBe(12);
    expect(normalizeTerminalFontSize(10)).toBe(MIN_TERMINAL_FONT_SIZE);
    expect(normalizeTerminalFontSize(99)).toBe(MAX_TERMINAL_FONT_SIZE);
    expect(normalizeTerminalFontSize("bad")).toBe(DEFAULT_TERMINAL_FONT_SIZE);
  });

  it("persists and reads the browser-local terminal font size", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      }
    };

    writeTerminalFontSize(storage, 12);
    expect(readTerminalFontSize(storage)).toBe(12);
  });
});
