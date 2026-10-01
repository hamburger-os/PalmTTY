import { type RemoteAppCursorMessage } from "@palmtty/protocol";

/** Strict bounded parser for the native helper's window-relative 1e6 coordinates. */
export function parseNativeCursorSample(sample: string): RemoteAppCursorMessage | null {
  const match = /^(\d{1,7}|-1) (\d{1,7}|-1)$/.exec(sample);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x === -1 && y === -1) return { type: "cursor", visible: false };
  if (x < 0 || x > 1_000_000 || y < 0 || y > 1_000_000) return null;
  return { type: "cursor", visible: true, x: x / 1_000_000, y: y / 1_000_000 };
}
