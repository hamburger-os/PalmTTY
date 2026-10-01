import { describe, expect, it } from "vitest";
import { RemoteTouchpadGesture } from "./remote-app-gestures.js";

describe("remote trackpad gesture ownership", () => {
  it("sends a click only for an unmodified single-finger tap", () => {
    const gesture = new RemoteTouchpadGesture();
    gesture.down(1, { x: 0.2, y: 0.3 });
    expect(gesture.up(1)).toBe(true);
    gesture.down(2, { x: 0.2, y: 0.3 });
    expect(gesture.move(2, { x: 0.4, y: 0.5 })).toEqual({
      type: "move", dx: 0.2, dy: 0.2
    });
    expect(gesture.up(2)).toBe(false);
  });

  it("uses two-finger centroid movement, resets when either finger lifts, and never taps", () => {
    const gesture = new RemoteTouchpadGesture();
    gesture.down(1, { x: 0.1, y: 0.1 });
    gesture.down(2, { x: 0.3, y: 0.1 });
    const first = gesture.move(1, { x: 0.1, y: 0.2 });
    expect(first?.type).toBe("scroll");
    if (first?.type === "scroll") expect(first.dy).toBeCloseTo(0.05);
    const second = gesture.move(2, { x: 0.3, y: 0.2 });
    expect(second?.type).toBe("scroll");
    if (second?.type === "scroll") expect(second.dy).toBeCloseTo(0.05);
    expect(gesture.up(1)).toBe(false);
    const motion = gesture.move(2, { x: 0.35, y: 0.25 });
    expect(motion?.type).toBe("move");
    if (motion?.type === "move") {
      expect(motion.dx).toBeCloseTo(0.05);
      expect(motion.dy).toBeCloseTo(0.05);
    }
    expect(gesture.up(2)).toBe(false);
  });

  it("does not interpret a cancelled or partial two-finger gesture as a click", () => {
    const gesture = new RemoteTouchpadGesture();
    gesture.down(1, { x: 0.2, y: 0.2 });
    gesture.cancel();
    expect(gesture.up(1)).toBe(false);
    gesture.down(2, { x: 0.2, y: 0.2 });
    gesture.down(3, { x: 0.3, y: 0.3 });
    expect(gesture.up(3)).toBe(false);
    expect(gesture.up(2)).toBe(false);
    gesture.down(4, { x: 0.4, y: 0.4 });
    expect(gesture.up(4)).toBe(true);
  });
});
