import { describe, expect, it } from "vitest";
import { remoteDisplaySize, remoteVideoPoint } from "./remote-app-presentation.js";

const limits = { minWidth: 320, minHeight: 240, maxWidth: 1600, maxHeight: 1000 };

describe("Remote App video presentation", () => {
  it("preserves a portrait surface ratio under DPR and both maximum bounds", () => {
    const output = remoteDisplaySize(390, 850, 2, limits);
    expect(output?.height).toBe(1000);
    expect(output?.width).toBe(458);
    expect(output!.width / output!.height).toBeCloseTo(390 / 850, 2);
    expect(remoteDisplaySize(1000, 2000, 2, limits))
      .toEqual({ width: 500, height: 1000 });
    expect(remoteDisplaySize(0, 800, 2, limits)).toBeNull();
  });

  it("rejects taps in letterbox margins and maps video center", () => {
    const bounds = { left: 0, top: 0, width: 360, height: 700 };
    const video = { width: 1280, height: 720 };
    expect(remoteVideoPoint(bounds, video, 180, 20, "contain", false)).toBeUndefined();
    expect(remoteVideoPoint(bounds, video, 180, 350, "contain", false))
      .toEqual({ x: 0.5, y: 0.5 });
  });

  it("maps cropped cover pixels into the actually visible remote segment", () => {
    const surface = { left: 10, top: 20, width: 360, height: 700 };
    const video = { width: 1280, height: 720 };
    const left = remoteVideoPoint(surface, video, 10, 370, "cover", false);
    const right = remoteVideoPoint(surface, video, 370, 370, "cover", false);
    expect(left?.x).toBeGreaterThan(0);
    expect(right?.x).toBeLessThan(1);
    expect(left?.x).toBeCloseTo(1 - right!.x);
    expect(remoteVideoPoint(surface, video, 190, 370, "cover", false))
      .toEqual({ x: 0.5, y: 0.5 });
  });
});
