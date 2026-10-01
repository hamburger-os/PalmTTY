import { describe, expect, it } from "vitest";
import { parseNativeCursorSample } from "./remote-app-cursor.js";

describe("owned-window cursor telemetry", () => {
  it("parses only bounded normalized coordinates", () => {
    expect(parseNativeCursorSample("500000 750000")).toEqual({
      type: "cursor", visible: true, x: 0.5, y: 0.75
    });
    expect(parseNativeCursorSample("0 1000000")).toEqual({
      type: "cursor", visible: true, x: 0, y: 1
    });
    expect(parseNativeCursorSample("-1 -1")).toEqual({ type: "cursor", visible: false });
  });
  it("drops partial, malformed or global desktop coordinates", () => {
    for (const input of ["1000001 0", "-1 1", "0 -1", "0.5 0.5",
      "NaN 3", "0 2 extra", "10000000 1", "0 0\nCONTROL"]) {
      expect(parseNativeCursorSample(input)).toBeNull();
    }
  });
});
