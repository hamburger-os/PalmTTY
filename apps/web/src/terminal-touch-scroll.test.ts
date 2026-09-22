import { describe, expect, it } from "vitest";
import { consumeTouchScrollDelta } from "./terminal-touch-scroll.js";

describe("consumeTouchScrollDelta", () => {
  it("scrolls toward newer lines when the finger moves upward", () => {
    expect(consumeTouchScrollDelta(0, 120, 88, 16)).toEqual({
      lines: 2,
      remainderPx: 0
    });
  });

  it("scrolls toward older lines when the finger moves downward", () => {
    expect(consumeTouchScrollDelta(0, 80, 112, 16)).toEqual({
      lines: -2,
      remainderPx: 0
    });
  });

  it("keeps sub-line movement until it becomes a full row", () => {
    const first = consumeTouchScrollDelta(0, 100, 93, 16);
    expect(first).toEqual({ lines: 0, remainderPx: 7 });

    expect(consumeTouchScrollDelta(first.remainderPx, 93, 82, 16)).toEqual({
      lines: 1,
      remainderPx: 2
    });
  });

  it("ignores invalid line geometry without losing accumulated movement", () => {
    expect(consumeTouchScrollDelta(5, 100, 80, 0)).toEqual({
      lines: 0,
      remainderPx: 5
    });
  });
});
