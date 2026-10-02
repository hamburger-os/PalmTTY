import { describe, expect, it } from "vitest";
import { parseNativeInputStatus } from "./remote-app-input-status.js";

describe("bounded native input-environment diagnostics", () => {
  it("accepts only known actionable status tokens", () => {
    for (const state of ["ready", "session-disconnected", "desktop-unavailable",
      "display-unavailable", "window-unavailable", "focus-denied",
      "window-occluded", "input-rejected"]) {
      expect(parseNativeInputStatus(state)).toBe(state);
    }
  });
  it("never exposes arbitrary stderr details or identifiers", () => {
    for (const raw of ["blocked", "elevated", "WinSta0\\Winlogon", "ready pid=42",
      "session-disconnected\nPALMTTY_APP_HOST_CURSOR 0 0", ""]) {
      expect(parseNativeInputStatus(raw)).toBeNull();
    }
  });
});
