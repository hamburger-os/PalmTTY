import { describe, expect, it } from "vitest";
import { TerminalMouseReportGuard } from "./terminal-mouse-report.js";

const UP = "\u001b[<64;12;8M";
const DOWN = "\u001b[<65;12;8M";
const BAD_UP = "\u001b[<64;NaN;NaNM";
const BAD_DOWN = "\u001b[<65;NaN;NaNM";

describe("terminal SGR mouse report guard", () => {
  it("passes valid wheel reports and repairs inertial NaN positions", () => {
    let now = 10;
    const guard = new TerminalMouseReportGuard(() => now);
    expect(guard.handle(UP, "vt200")).toEqual({ kind: "mouse", data: UP });
    now += 30;
    expect(guard.handle(BAD_UP, "vt200")).toEqual({ kind: "mouse", data: UP });
    now += 30;
    expect(guard.handle(BAD_DOWN, "vt200")).toEqual({ kind: "mouse", data: DOWN });
    expect(guard.handle("普通中文内容", "vt200"))
      .toEqual({ kind: "input", data: "普通中文内容" });
    expect(guard.handle("NaNM;NaNM", "vt200"))
      .toEqual({ kind: "input", data: "NaNM;NaNM" });
  });

  it("never forwards a NaN wheel report without a recent valid position", () => {
    let now = 0;
    const guard = new TerminalMouseReportGuard(() => now);
    expect(guard.handle(BAD_UP, "any")).toEqual({ kind: "mouse" });
    expect(guard.handle(UP, "any")).toEqual({ kind: "mouse", data: UP });
    now = 2501;
    expect(guard.handle(BAD_UP, "any")).toEqual({ kind: "mouse" });
  });

  it("clears the wheel position when mouse tracking is disabled or renderer resets", () => {
    const guard = new TerminalMouseReportGuard(() => 100);
    guard.handle(UP, "vt200");
    expect(guard.handle(BAD_UP, "none")).toEqual({ kind: "mouse" });
    expect(guard.handle(BAD_UP, "vt200")).toEqual({ kind: "mouse" });
    guard.handle(DOWN, "vt200");
    guard.reset();
    expect(guard.handle(BAD_UP, "vt200")).toEqual({ kind: "mouse" });
  });

  it("does not repair malformed click/drag or off-protocol fields", () => {
    const guard = new TerminalMouseReportGuard(() => 100);
    guard.handle(UP, "vt200");
    for (const data of [
      "\u001b[<0;NaN;NaNM",
      "\u001b[<32;NaN;NaNM",
      "\u001b[<64;NaN;NaNm",
      "\u001b[<64;Infinity;NaNM",
      "\u001b[<NaN;12;8M",
      "\u001b[<65;-1;NaNM",
      "\u001b[<65;NaN;0M",
      "\u001b[<999999999999999999999;NaN;NaNM"
    ]) {
      expect(guard.handle(data, "vt200")).toEqual({ kind: "mouse" });
    }
    expect(guard.handle("\u001b[<0;2;3M", "vt200"))
      .toEqual({ kind: "mouse", data: "\u001b[<0;2;3M" });
    expect(guard.handle("\u001b[A", "vt200"))
      .toEqual({ kind: "input", data: "\u001b[A" });
  });

  it("supports normal and SGR pixel coordinates without capping to columns", () => {
    const guard = new TerminalMouseReportGuard(() => 0);
    expect(guard.handle("\u001b[<64;900;1600M", "drag"))
      .toEqual({ kind: "mouse", data: "\u001b[<64;900;1600M" });
    expect(guard.handle(BAD_UP, "drag"))
      .toEqual({ kind: "mouse", data: "\u001b[<64;900;1600M" });
  });
});
