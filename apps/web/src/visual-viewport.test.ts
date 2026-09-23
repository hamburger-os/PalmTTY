import { describe, expect, it } from "vitest";
import { workbenchVisualViewportFrame } from "./visual-viewport.js";

describe("workbench visual viewport frame", () => {
  it("uses the visual viewport as the workbench frame", () => {
    expect(workbenchVisualViewportFrame({
      width: 390,
      height: 437,
      offsetLeft: 0,
      offsetTop: 47,
      scale: 1
    })).toEqual({
      width: 390,
      height: 437,
      left: 0,
      top: 47
    });
  });

  it("keeps the workbench framed while the user is pinch zooming", () => {
    expect(workbenchVisualViewportFrame({
      width: 300,
      height: 500,
      offsetLeft: 24,
      offsetTop: 30,
      scale: 1.25
    })).toEqual({
      width: 300,
      height: 500,
      left: 24,
      top: 30
    });
  });

  it("rejects unusable viewport metrics", () => {
    expect(workbenchVisualViewportFrame({
      width: 0,
      height: 500,
      offsetLeft: 0,
      offsetTop: 0,
      scale: 1
    })).toBeNull();
  });
});
