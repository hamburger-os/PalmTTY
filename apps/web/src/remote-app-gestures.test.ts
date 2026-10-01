import { describe, expect, it } from "vitest";
import { RemoteTouchpadGesture } from "./remote-app-gestures.js";

describe("remote trackpad gestures", () => {
  it("recognizes a one-finger tap and suppresses moved and long taps", () => {
    const gesture = new RemoteTouchpadGesture();
    gesture.down(1, { x: .2, y: .3 }, 100);
    expect(gesture.canLongPress(1)).toBe(true);
    expect(gesture.up(1, 200)).toBe("left");
    gesture.down(2, { x: .2, y: .3 }, 1000);
    expect(gesture.move(2, { x: .4, y: .5 })).toEqual({ type: "move", dx: .2, dy: .2 });
    expect(gesture.canLongPress(2)).toBe(false);
    expect(gesture.up(2, 1100)).toBeNull();
    gesture.down(3, { x: .2, y: .3 }, 2000);
    expect(gesture.up(3, 2450)).toBeNull();
  });
  it("uses two-finger tap for right click without synthesizing a left click", () => {
    const gesture = new RemoteTouchpadGesture();
    gesture.down(1, { x: .2, y: .2 }, 100);
    gesture.down(2, { x: .3, y: .2 }, 130);
    expect(gesture.canLongPress(1)).toBe(false);
    expect(gesture.up(1, 200)).toBeNull();
    expect(gesture.up(2, 230)).toBe("right");
  });
  it("scrolls by centroid and never clicks after partial lift or cancellation", () => {
    const gesture = new RemoteTouchpadGesture();
    gesture.down(1, { x: .1, y: .1 }, 100);
    gesture.down(2, { x: .3, y: .1 }, 100);
    const first = gesture.move(1, { x: .1, y: .2 });
    expect(first?.type).toBe("scroll");
    if (first?.type === "scroll") expect(first.dy).toBeCloseTo(.05);
    const second = gesture.move(2, { x: .3, y: .2 });
    expect(second?.type).toBe("scroll");
    if (second?.type === "scroll") expect(second.dy).toBeCloseTo(.05);
    expect(gesture.up(1)).toBeNull();
    expect(gesture.move(2, { x: .35, y: .25 })?.type).toBe("move");
    expect(gesture.up(2)).toBeNull();
    gesture.down(3, { x: .2, y: .2 }, 1000);
    gesture.cancel();
    expect(gesture.up(3)).toBeNull();
  });
});
