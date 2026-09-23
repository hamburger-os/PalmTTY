import { describe, expect, it } from "vitest";
import {
  Ime229InputTransaction,
  recoverIme229ControlKey,
  textareaInputDelta
} from "./terminal-ime-input.js";

describe("terminal IME input compatibility", () => {
  it("derives punctuation inserted after a keyCode 229 keydown", () => {
    expect(textareaInputDelta("", "/")).toBe("/");
    expect(textareaInputDelta("abc", "abc，")).toBe("，");
  });

  it("derives delete plus insert for iOS equal-length replacements", () => {
    expect(textareaInputDelta("a ", "a。")).toBe("\u007f。");
    expect(textareaInputDelta("abcde", "abXYde")).toBe("\u007f\u007f\u007fXYde");
  });

  it("buffers xterm output until the textarea delta is known", () => {
    const transaction = new Ime229InputTransaction();
    transaction.begin("");
    expect(transaction.captureTerminalData("/")).toBeUndefined();
    expect(transaction.finalize("/")).toBe("/");
    expect(transaction.active).toBe(false);
  });

  it("uses buffered xterm data when the textarea did not change", () => {
    const transaction = new Ime229InputTransaction();
    transaction.begin("same");
    transaction.captureTerminalData("\r");
    expect(transaction.finalize("same")).toBe("\r");
  });

  it("cancels a pending fallback when real composition takes ownership", () => {
    const transaction = new Ime229InputTransaction();
    transaction.begin("");
    transaction.captureTerminalData("x");
    transaction.cancel();
    expect(transaction.finalize("字")).toBeUndefined();
  });

  it("recovers confirmed control keys hidden behind keyCode 229", () => {
    expect(recoverIme229ControlKey({
      type: "keydown",
      keyCode: 229,
      code: "KeyJ",
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false
    })).toBe("\n");
    expect(recoverIme229ControlKey({
      type: "keydown",
      keyCode: 229,
      code: "Space",
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false
    })).toBe("\u0000");
    expect(recoverIme229ControlKey({
      type: "keydown",
      keyCode: 229,
      code: "Escape",
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false
    })).toBe("\u001b");
  });

  it("does not recover the same control key again on keyup", () => {
    expect(recoverIme229ControlKey({
      type: "keyup",
      keyCode: 229,
      code: "KeyJ",
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      isComposing: false
    })).toBeUndefined();
  });

  it("leaves printable composition and Alt/Meta chords to xterm", () => {
    expect(recoverIme229ControlKey({
      type: "keydown",
      keyCode: 229,
      code: "KeyA",
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      isComposing: false
    })).toBeUndefined();
    expect(recoverIme229ControlKey({
      type: "keydown",
      keyCode: 229,
      code: "KeyA",
      ctrlKey: true,
      altKey: true,
      metaKey: false,
      isComposing: false
    })).toBeUndefined();
  });
});
