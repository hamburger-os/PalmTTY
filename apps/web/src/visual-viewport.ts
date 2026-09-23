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

export function workbenchVisualViewportFrame(
  viewport: WorkbenchVisualViewport
): WorkbenchVisualViewportFrame | null {
  const { height, width, offsetLeft, offsetTop } = viewport;
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(width) ||
    !Number.isFinite(offsetLeft) ||
    !Number.isFinite(offsetTop) ||
    height <= 0 ||
    width <= 0
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
