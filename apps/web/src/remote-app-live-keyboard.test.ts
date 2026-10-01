import { describe, expect, it } from "vitest";
import { remoteAppLiveKeyboardKey, shouldCommitRemoteLiveText } from "./remote-app-live-keyboard.js";

describe("remote app mobile live-keyboard boundary", () => {
  it("defers Chinese IME input and delayed final events until composition flush", () => {
    expect(shouldCommitRemoteLiveText(false, false, false)).toBe(true);
    expect(shouldCommitRemoteLiveText(true, false, false)).toBe(false);
    expect(shouldCommitRemoteLiveText(false, true, false)).toBe(false);
    expect(shouldCommitRemoteLiveText(false, false, true)).toBe(false);
  });
  it("accepts navigation and editing keys without introducing arbitrary commands", () => {
    for (const key of ["Enter", "Tab", "Backspace", "Escape", "ArrowLeft", "Delete"])
      expect(remoteAppLiveKeyboardKey(key)).toBe(key);
    for (const key of ["a", "中", "Unidentified", "Process", "Meta", "F12"])
      expect(remoteAppLiveKeyboardKey(key)).toBeNull();
  });
});
