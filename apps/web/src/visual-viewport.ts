export type WorkbenchVisualViewport = Pick<
  VisualViewport,
  "height" | "width" | "offsetLeft" | "offsetTop" | "scale"
>;

export type WorkbenchVisualViewportFrame = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const ZOOM_EPSILON = 0.01;

export function workbenchVisualViewportFrame(
  viewport: WorkbenchVisualViewport
): WorkbenchVisualViewportFrame | null {
  const { height, width, offsetLeft, offsetTop, scale } = viewport;
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(width) ||
    !Number.isFinite(offsetLeft) ||
    !Number.isFinite(offsetTop) ||
    !Number.isFinite(scale) ||
    height <= 0 ||
    width <= 0 ||
    Math.abs(scale - 1) > ZOOM_EPSILON
  ) {
    return null;
  }

  return {
    top: offsetTop,
    left: offsetLeft,
    width,
    height
  };
}
