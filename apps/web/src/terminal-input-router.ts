import {
  TerminalMouseReportGuard,
  type MouseTrackingMode
} from "./terminal-mouse-report.js";

// Browser-owned scrollback vs intentional application mouse interaction.
// The caller keeps xterm's native touch gesture handling as the only gesture
// owner. In browse mode, an SGR wheel report can move local scrollback without
// ever becoming PTY input. Alternate-screen applications own their own view;
// use interact mode to scroll those applications.
export type TouchInputMode = "browse" | "interact";

export type TerminalInputDecision =
  | { kind: "input"; data: string }
  | { kind: "mouse"; data: string }
  | { kind: "scroll"; lines: number }
  | { kind: "drop" };

export class TerminalInputRouter {
  private readonly mouse = new TerminalMouseReportGuard();

  route(
    data: string,
    trackingMode: MouseTrackingMode,
    touchMode: TouchInputMode
  ): TerminalInputDecision {
    const report = this.mouse.handle(data, trackingMode);
    if (report.kind === "input") return report;
    if (touchMode === "browse") {
      if (trackingMode !== "none" && report.wheelDirection !== undefined) {
        return { kind: "scroll", lines: report.wheelDirection };
      }
      return { kind: "drop" };
    }
    return report.data === undefined
      ? { kind: "drop" }
      : { kind: "mouse", data: report.data };
  }
}
