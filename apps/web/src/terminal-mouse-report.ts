// xterm's touch inertia may synthesize Gesture CHANGE events without clientX/Y.
// In an SGR mouse-tracking TUI, its coordinates can then serialize as "NaN".
// Never forward malformed mouse reports to the PTY: the application's CSI
// parser may reject the escape and insert the trailing "NaNM" as ordinary text.
// Reuse a recent, validated wheel position only for those inertia frames.
// xterm continues to own gesture generation, scrolling, and mouse modes.
const SGR_MOUSE_FIELDS = /^\u001b\[<([^;Mm]{1,24});([^;Mm]{1,24});([^;Mm]{1,24})([Mm])$/;
const WHEEL_POSITION_MAX_AGE_MS = 2000;

export type MouseTrackingMode = "none" | "x10" | "vt200" | "drag" | "any";

export type MouseReportInput =
  | { kind: "input"; data: string }
  | { kind: "mouse"; data?: string };

type WheelPosition = { x: number; y: number; timestamp: number };

function validInteger(value: string, min: number): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : undefined;
}

export class TerminalMouseReportGuard {
  private lastWheel: WheelPosition | undefined;

  constructor(private readonly now: () => number = () => performance.now()) {}

  handle(data: string, mode: MouseTrackingMode): MouseReportInput {
    if (mode === "none") this.lastWheel = undefined;
    const fields = SGR_MOUSE_FIELDS.exec(data);
    if (!fields) return { kind: "input", data };

    const button = validInteger(fields[1]!, 0);
    const x = validInteger(fields[2]!, 1);
    const y = validInteger(fields[3]!, 1);
    const terminator = fields[4]!;
    if (button !== undefined && x !== undefined && y !== undefined) {
      if (mode === "none") return { kind: "mouse" };
      // Only wheel reports seed inertia recovery. Click/drag must never
      // redirect the last scroll location or activate a TUI control.
      if ((button === 64 || button === 65) && terminator === "M") {
        this.lastWheel = { x, y, timestamp: this.now() };
      }
      return { kind: "mouse", data };
    }

    // Reconstruct ONLY the missing coordinates on xterm-generated SGR wheel
    // reports. No arbitrary malformed button, click, release or drag is repaired.
    const wheel = button === 64 || button === 65;
    const missing = fields[2] === "NaN" || fields[3] === "NaN";
    const onlyCoordinatesMissing =
      (x !== undefined || fields[2] === "NaN") &&
      (y !== undefined || fields[3] === "NaN");
    const previous = this.lastWheel;
    const age = previous === undefined ? Infinity : this.now() - previous.timestamp;
    if (mode !== "none" && wheel && terminator === "M" &&
        missing && onlyCoordinatesMissing && previous &&
        age >= 0 && age <= WHEEL_POSITION_MAX_AGE_MS) {
      return { kind: "mouse", data: "\u001b[<" + button + ";" + previous.x + ";" + previous.y + "M" };
    }

    // An invalid CSI mouse report must not fall through the IME/key input path.
    return { kind: "mouse" };
  }

  reset(): void {
    this.lastWheel = undefined;
  }
}
