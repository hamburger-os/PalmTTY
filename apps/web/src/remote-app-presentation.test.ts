import { describe, expect, it } from "vitest";
import { hasPresentableVideoFrame, hasStalledVideoFrames, remoteAppVisualState, remoteDisplaySize, remoteVideoPoint, remoteVideoCursorPosition, remoteTouchpadDelta } from "./remote-app-presentation.js";

const limits = { minWidth: 320, minHeight: 240, maxWidth: 1600, maxHeight: 1000 };

describe("Remote App video presentation", () => {
  it("moves the trackpad cursor in displayed video coordinates, even when cropped", () => {
    const surface = { width: 360, height: 700 };
    const video = { width: 1280, height: 720 };
    const motion = { x: .1, y: .1 };
    const contained = remoteTouchpadDelta(motion, surface, video, "contain");
    const covered = remoteTouchpadDelta(motion, surface, video, "cover");
    expect(contained.y).toBeGreaterThan(covered.y);
    expect(contained.x).toBeCloseTo(.16);
    expect(covered.y).toBeCloseTo(.16);
    expect(remoteTouchpadDelta({ x: 100, y: -100 }, surface, video, "cover"))
      .toEqual({ x: 1, y: -1 });
  });

  it("positions the remote cursor exactly where the same video point would click", () => {
    const surface = { left: 0, top: 0, width: 360, height: 700 };
    const video = { width: 1280, height: 720 };
    for (const fit of ["contain", "cover"] as const) {
      const pixel = remoteVideoCursorPosition(surface, video, { x: 0.5, y: 0.5 }, fit);
      expect(pixel).toBeDefined();
      const back = remoteVideoPoint(surface, video, pixel!.x, pixel!.y, fit, false);
      expect(back?.x).toBeCloseTo(0.5);
      expect(back?.y).toBeCloseTo(0.5);
    }
    expect(remoteVideoCursorPosition(surface, video, { x: 0, y: 0.5 }, "cover")).toBeUndefined();
    expect(remoteVideoCursorPosition(surface, video, { x: 0.5, y: 0 }, "contain")!.y)
      .toBeGreaterThan(0);
    expect(remoteVideoCursorPosition(surface, { width: 0, height: 0 }, { x: 1, y: 1 }, "contain"))
      .toBeUndefined();
  });

  it("does not report a Safari stall when native video callbacks never fired", () => {
    expect(hasStalledVideoFrames(false, 1000, 30_000)).toBe(false);
    expect(hasStalledVideoFrames(true, 1000, 30_000)).toBe(true);
    expect(hasStalledVideoFrames(true, 1000, 8000)).toBe(false);
  });

  it("recognizes a Safari-presentable frame only from an attached live track", () => {
    expect(hasPresentableVideoFrame(true, true, 2, 640, 480)).toBe(true);
    expect(hasPresentableVideoFrame(true, true, 4, 640, 480)).toBe(true);
    expect(hasPresentableVideoFrame(false, true, 4, 640, 480)).toBe(false);
    expect(hasPresentableVideoFrame(true, false, 4, 640, 480)).toBe(false);
    expect(hasPresentableVideoFrame(true, true, 1, 640, 480)).toBe(false);
    expect(hasPresentableVideoFrame(true, true, 4, 0, 480)).toBe(false);
  });

  it("does not return to the waiting overlay when a decoded frame is already visible", () => {
    expect(remoteAppVisualState(false, false, false)).toBe("waiting");
    expect(remoteAppVisualState(false, false, true)).toBe("waiting");
    expect(remoteAppVisualState(true, true, false)).toBe("playing");
    expect(remoteAppVisualState(true, true, true)).toBe("interrupted");
    expect(remoteAppVisualState(true, false, false)).toBe("interrupted");
  });

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
