import { describe, expect, it } from "vitest";
import {
  POINTER_TERMINAL_SCROLLBAR_WIDTH,
  TOUCH_TERMINAL_SCROLLBAR_WIDTH,
  terminalScrollbarWidth
} from "./terminal-scrollbar.js";

describe("terminal scrollbar policy", () => {
  it("uses the narrower xterm-owned indicator with a coarse pointer", () => {
    expect(terminalScrollbarWidth(true)).toBe(TOUCH_TERMINAL_SCROLLBAR_WIDTH);
    expect(terminalScrollbarWidth(true)).toBe(4);
  });

  it("keeps the xterm scrollbar usable with a precise pointer", () => {
    expect(terminalScrollbarWidth(false)).toBe(POINTER_TERMINAL_SCROLLBAR_WIDTH);
    expect(terminalScrollbarWidth(false)).toBe(8);
  });
});
