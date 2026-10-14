import {
  TerminalMouseReportGuard,
  type MouseTrackingMode
} from "./terminal-mouse-report.js";

// Browser Browse mode drops mouse input; xterm remains the sole touch and
// viewport-scrolling owner. In an application-controlled mouse-tracking mode,
// users explicitly switch to Interact for SGR mouse actions. No application
// touch adapter or local scrollLines() override is installed.
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
    if (touchMode === "browse") return { kind: "drop" };
    return report.data === undefined
      ? { kind: "drop" }
      : { kind: "mouse", data: report.data };
  }
}
