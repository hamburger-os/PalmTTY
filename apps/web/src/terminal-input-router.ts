import {
  TerminalMouseReportGuard,
  type MouseTrackingMode
} from "./terminal-mouse-report.js";

// xterm remains the sole touch/scroll owner. When a TUI captures the mouse,
// Browse forwards only valid SGR wheel reports so its own message viewport
// remains scrollable; clicks, moves and drags still require Interact.
// Normal-buffer scrollback remains local to xterm.
export type TouchInputMode = "browse" | "interact";

export type TerminalInputDecision =
  | { kind: "input"; data: string }
  | { kind: "mouse"; data: string }
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
    if (touchMode === "browse" && !report.wheel) return { kind: "drop" };
    return report.data === undefined
      ? { kind: "drop" }
      : { kind: "mouse", data: report.data };
  }
}
