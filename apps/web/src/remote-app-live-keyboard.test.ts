import { describe, expect, it } from "vitest";
import { remoteAppLiveKeyboardKey } from "./remote-app-live-keyboard.js";

describe("remote app mobile live-keyboard boundary", () => {
  it("accepts navigation and editing keys without introducing arbitrary commands", () => {
    for (const key of ["Enter", "Tab", "Backspace", "Escape", "ArrowLeft", "Delete"])
      expect(remoteAppLiveKeyboardKey(key)).toBe(key);
    for (const key of ["a", "中", "Unidentified", "Process", "Meta", "F12"])
      expect(remoteAppLiveKeyboardKey(key)).toBeNull();
  });
});
