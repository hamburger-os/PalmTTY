import { describe, expect, it } from "vitest";
import {
  applyTerminalModifiers,
  controlCharacter,
  encodeControlShortcut,
  encodeTerminalKey
} from "./terminal-key-input.js";

describe("terminal key input", () => {
  it("encodes the mobile keybar base keys", () => {
    expect(encodeTerminalKey("enter")).toBe("\r");
    expect(encodeTerminalKey("backTab")).toBe("\u001b[Z");
    expect(encodeTerminalKey("pageUp")).toBe("\u001b[5~");
    expect(encodeTerminalKey("pageDown")).toBe("\u001b[6~");
    expect(encodeTerminalKey("backspace")).toBe("\u007f");
    expect(encodeTerminalKey("delete")).toBe("\u001b[3~");
  });

  it("encodes Ctrl shortcuts as terminal control characters", () => {
    expect(controlCharacter("c")).toBe("\u0003");
    expect(encodeControlShortcut("J")).toBe("\n");
    expect(encodeControlShortcut("D")).toBe("\u0004");
    expect(() => encodeControlShortcut("?")).toThrow();
  });

  it("applies one-shot Ctrl and Alt modifiers to typed characters", () => {
    expect(
      applyTerminalModifiers("c", { ctrl: true, alt: false })
    ).toBe("\u0003");
    expect(
      applyTerminalModifiers("x", { ctrl: false, alt: true })
    ).toBe("\u001bx");
    expect(
      applyTerminalModifiers("c", { ctrl: true, alt: true })
    ).toBe("\u001b\u0003");
  });

  it("encodes modified navigation keys with xterm CSI modifier parameters", () => {
    expect(
      encodeTerminalKey("arrowUp", { ctrl: true, alt: false })
    ).toBe("\u001b[1;5A");
    expect(
      encodeTerminalKey("arrowLeft", { ctrl: false, alt: true })
    ).toBe("\u001b[1;3D");
    expect(
      encodeTerminalKey("pageDown", { ctrl: true, alt: true })
    ).toBe("\u001b[6;7~");
  });

  it("routes known xterm key sequences through the same modifier encoder", () => {
    expect(
      applyTerminalModifiers("\u001b[A", { ctrl: true, alt: false })
    ).toBe("\u001b[1;5A");
    expect(
      applyTerminalModifiers("\u001b[D", { ctrl: false, alt: true })
    ).toBe("\u001b[1;3D");
    expect(
      applyTerminalModifiers("\u001bOA", { ctrl: true, alt: false })
    ).toBe("\u001b[1;5A");
  });

  it("uses DECCKM application cursor sequences when requested", () => {
    expect(
      encodeTerminalKey(
        "arrowUp",
        { ctrl: false, alt: false },
        { applicationCursorKeysMode: true }
      )
    ).toBe("\u001bOA");
    expect(
      encodeTerminalKey(
        "arrowLeft",
        { ctrl: false, alt: false },
        { applicationCursorKeysMode: true }
      )
    ).toBe("\u001bOD");
    expect(
      encodeTerminalKey(
        "arrowUp",
        { ctrl: true, alt: false },
        { applicationCursorKeysMode: true }
      )
    ).toBe("\u001b[1;5A");
  });
});
