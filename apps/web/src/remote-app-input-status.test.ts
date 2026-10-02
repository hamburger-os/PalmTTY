import { describe, expect, it } from "vitest";
import { RemoteAppInputStatusSchema } from "@palmtty/protocol";
import { remoteAppInputStatusKey } from "./remote-app-input-status.js";

describe("headless Remote App user-visible diagnostics", () => {
  it("maps every typed native input state to a translation", () => {
    for (const state of RemoteAppInputStatusSchema.options) {
      expect(remoteAppInputStatusKey(state)).toMatch(/^remoteApp\./);
    }
    expect(remoteAppInputStatusKey("display-unavailable"))
      .toBe("remoteApp.inputState.displayUnavailable");
    expect(remoteAppInputStatusKey("desktop-unavailable"))
      .toBe("remoteApp.inputState.desktopUnavailable");
  });
});
