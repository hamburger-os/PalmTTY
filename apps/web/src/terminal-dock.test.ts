import { describe, expect, it } from "vitest";
import { nextTerminalDockMode } from "./terminal-dock.js";

describe("mobile terminal dock presentation", () => {
  it("switches full and compact without trapping a hidden dock", () => {
    expect(nextTerminalDockMode("compact", "toggle")).toBe("full");
    expect(nextTerminalDockMode("full", "toggle")).toBe("compact");
    expect(nextTerminalDockMode("full", "hide")).toBe("hidden");
    expect(nextTerminalDockMode("hidden", "show")).toBe("compact");
  });
});
