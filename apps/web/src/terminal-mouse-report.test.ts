import { describe, expect, it } from "vitest";
import { TerminalMouseReportGuard } from "./terminal-mouse-report.js";

const UP = "\u001b[<64;12;8M";
const DOWN = "\u001b[<65;12;8M";

describe("terminal SGR mouse report safety", () => {
  const guard = new TerminalMouseReportGuard();

  it("accepts complete mouse events only when tracking is active", () => {
    expect(guard.handle(UP, "vt200"))
      .toEqual({ kind: "mouse", data: UP, wheelDirection: -1 });
    expect(guard.handle(DOWN, "drag"))
      .toEqual({ kind: "mouse", data: DOWN, wheelDirection: 1 });
    expect(guard.handle("\u001b[<0;2;3M", "any"))
      .toEqual({ kind: "mouse", data: "\u001b[<0;2;3M" });
    expect(guard.handle("\u001b[<0;2;3m", "any"))
      .toEqual({ kind: "mouse", data: "\u001b[<0;2;3m" });
    expect(guard.handle(UP, "none")).toEqual({ kind: "mouse" });
    expect(guard.handle("普通中文内容", "any"))
      .toEqual({ kind: "input", data: "普通中文内容" });
    expect(guard.handle("\u001b[A", "any"))
      .toEqual({ kind: "input", data: "\u001b[A" });
  });

  it("never repairs inertial NaN coordinates using stale coordinates", () => {
    guard.handle(UP, "vt200");
    for (const invalid of [
      "\u001b[<64;NaN;NaNM",
      "\u001b[<65;NaN;12M",
      "\u001b[<65;12;NaNM",
      "\u001b[<65;-1;1M",
      "\u001b[<NaN;12;8M",
      "\u001b[<65;Infinity;2M",
      "\u001b[<65;1;2X",
      "\u001b[<65;1;2Mtail",
      "\u001b[<999999999999;1;2M",
      "\u001b[<64;1;2m"
    ]) {
      expect(guard.handle(invalid, "vt200")).toEqual({ kind: "mouse" });
    }
  });

  it("drops untransportable X10 prefixes", () => {
    expect(guard.handle("\u001b[M\x60!!", "x10")).toEqual({ kind: "mouse" });
    expect(guard.handle("\u001b[Ma!!", "vt200")).toEqual({ kind: "mouse" });
  });

  it("recognizes modified wheel and pixel coordinates", () => {
    expect(guard.handle("\u001b[<68;0;0M", "any"))
      .toEqual({ kind: "mouse", data: "\u001b[<68;0;0M", wheelDirection: -1 });
    expect(guard.handle("\u001b[<81;900;1600M", "any"))
      .toEqual({ kind: "mouse", data: "\u001b[<81;900;1600M", wheelDirection: 1 });
    expect(guard.handle("\u001b[<128;5;5M", "any"))
      .toEqual({ kind: "mouse", data: "\u001b[<128;5;5M" });
  });
});
