import { describe, expect, it } from "vitest";
import { blocksRemoteAppInput, parseNativeInputStatus } from "./remote-app-input-status.js";

describe("bounded native input-environment diagnostics", () => {
  it("accepts only known actionable status tokens", () => {
    for (const state of ["ready", "session-disconnected", "desktop-unavailable",
      "display-unavailable", "window-unavailable", "focus-denied",
      "window-occluded", "input-rejected"]) {
      expect(parseNativeInputStatus(state)).toBe(state);
    }
  });
  it("gates only unsafe session/desktop/display input, not recoverable focus or occlusion", () => {
    expect(blocksRemoteAppInput("session-disconnected")).toBe(true);
    expect(blocksRemoteAppInput("desktop-unavailable")).toBe(true);
    expect(blocksRemoteAppInput("display-unavailable")).toBe(true);
    for (const state of ["ready", "focus-denied", "window-occluded",
      "window-unavailable", "input-rejected"] as const)
      expect(blocksRemoteAppInput(state)).toBe(false);
  });

  it("never exposes arbitrary stderr details or identifiers", () => {
    for (const raw of ["blocked", "elevated", "WinSta0\\Winlogon", "ready pid=42",
      "session-disconnected\nPALMTTY_APP_HOST_CURSOR 0 0", ""]) {
      expect(parseNativeInputStatus(raw)).toBeNull();
    }
  });
});
