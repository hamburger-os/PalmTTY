// Only complete, finite SGR mouse reports are forwarded. Legacy X10 reports
// cannot be represented faithfully through node-pty's UTF-8 string input;
// never let a malformed prefix reach a TUI input editor as printable text.
const SGR_MOUSE_FIELDS = /^\u001b\[<(\d{1,12});(\d{1,12});(\d{1,12})([Mm])$/;
const SGR_MOUSE_PREFIX = "\u001b[<";
const LEGACY_MOUSE_PREFIX = "\u001b[M";

export type MouseTrackingMode = "none" | "x10" | "vt200" | "drag" | "any";

export type MouseReportInput =
  | { kind: "input"; data: string }
  | { kind: "mouse"; data?: string; wheelDirection?: -1 | 1 };

function safeInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export class TerminalMouseReportGuard {
  handle(data: string, mode: MouseTrackingMode): MouseReportInput {
    if (!data.startsWith(SGR_MOUSE_PREFIX) &&
        !data.startsWith(LEGACY_MOUSE_PREFIX)) {
      return { kind: "input", data };
    }

    const fields = SGR_MOUSE_FIELDS.exec(data);
    if (!fields || mode === "none") return { kind: "mouse" };

    const button = safeInteger(fields[1]!);
    const x = safeInteger(fields[2]!);
    const y = safeInteger(fields[3]!);
    if (button === undefined || button > 255 ||
        x === undefined || y === undefined) {
      return { kind: "mouse" };
    }

    // Wheel buttons are 64/65 plus optional modifier bits (4/8/16).
    // 128+ is an extended button, not a wheel.
    const wheelButton = (button & 192) === 64 ? button & 3 : -1;
    // Wheel reports have no release packet; a release is not a safe wheel.
    if (fields[4] === "m" && wheelButton >= 0) return { kind: "mouse" };
    const wheelDirection = fields[4] === "M"
      ? wheelButton === 0 ? -1 : wheelButton === 1 ? 1 : undefined
      : undefined;
    return {
      kind: "mouse",
      data,
      ...(wheelDirection !== undefined ? { wheelDirection } : {})
    };
  }
}
