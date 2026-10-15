import { describe, expect, it } from "vitest";
import { TerminalInputRouter } from "./terminal-input-router.js";

describe("terminal mouse / keyboard input routing", () => {
  const router = new TerminalInputRouter();
  const UP = "\u001b[<64;4;5M";

  it("keeps normal input and IME characters intact in both modes", () => {
    for (const touchMode of ["browse", "interact"] as const) {
      for (const data of ["小说📖", "\r", "\u001b[A", "\u001b[200~小说\u001b[201~"]) {
        expect(router.route(data, "vt200", touchMode))
          .toEqual({ kind: "input", data });
      }
    }
  });

  it("allows only valid TUI wheel scrolling in browse mode", () => {
    expect(router.route(UP, "vt200", "browse"))
      .toEqual({ kind: "mouse", data: UP });
    expect(router.route("\u001b[<65;4;5M", "drag", "browse"))
      .toEqual({ kind: "mouse", data: "\u001b[<65;4;5M" });
    expect(router.route("\u001b[<68;4;5M", "any", "browse"))
      .toEqual({ kind: "mouse", data: "\u001b[<68;4;5M" });
    for (const event of [
      "\u001b[<0;4;5M", "\u001b[<0;4;5m",
      "\u001b[<32;4;5M", "\u001b[<128;4;5M"
    ]) {
      expect(router.route(event, "any", "browse"))
        .toEqual({ kind: "drop" });
    }
    expect(router.route(UP, "none", "browse"))
      .toEqual({ kind: "drop" });
  });

  it("forwards valid SGR mouse reports in interact mode", () => {
    expect(router.route(UP, "vt200", "interact"))
      .toEqual({ kind: "mouse", data: UP });
    expect(router.route("\u001b[<0;3;5M", "drag", "interact"))
      .toEqual({ kind: "mouse", data: "\u001b[<0;3;5M" });
    expect(router.route(UP, "none", "interact"))
      .toEqual({ kind: "drop" });
  });

  it("fails closed for damaged and legacy mouse input in every mode", () => {
    for (const mode of ["browse", "interact"] as const) {
      for (const bad of [
        "\u001b[<65;NaN;NaNM", "\u001b[<65;8;InfinityM",
        "\u001b[<65;8;3Mtail", "\u001b[Ma!!", "\u001b[M\x60!!"
      ]) {
        expect(router.route(bad, "vt200", mode)).toEqual({ kind: "drop" });
      }
    }
  });
});
