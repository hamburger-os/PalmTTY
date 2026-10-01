export type VideoFit = "contain" | "cover";
export type RemoteAppVisualState = "waiting" | "playing" | "interrupted";

/** A callback-capable Safari build is not necessarily delivering callbacks. */
export function hasStalledVideoFrames(
  callbackObserved: boolean, lastFrameAt: number, now: number
): boolean {
  return callbackObserved && lastFrameAt > 0 && now - lastFrameAt > 8000;
}

/** Safari can paint an attached live WebRTC frame before its video-frame callback fires. */
export function hasPresentableVideoFrame(
  liveTrack: boolean, sourceAttached: boolean, mediaReadyState: number,
  videoWidth: number, videoHeight: number
): boolean {
  return liveTrack && sourceAttached && mediaReadyState >= 2 &&
    videoWidth > 0 && videoHeight > 0;
}

/** Only browser-decoded frames can clear initial loading; hints and worker polling cannot. */
export function remoteAppVisualState(
  hasRenderedFrame: boolean, currentTrackRendered: boolean, hasPlaybackIssue: boolean
): RemoteAppVisualState {
  if (!hasRenderedFrame) return "waiting";
  return currentTrackRendered && !hasPlaybackIssue ? "playing" : "interrupted";
}
export type Geometry = { left: number; top: number; width: number; height: number };
export type DisplayBounds = { width: number; height: number };
export type UnitPoint = { x: number; y: number };

function evenClamped(value: number, minimum: number, maximum: number): number {
  const clamped = Math.max(minimum, Math.min(maximum, Math.round(value)));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

/** A single bounded scale factor preserves mobile portrait aspect ratio. */
export function remoteDisplaySize(
  width: number, height: number, dpr: number,
  limits: { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number }
): DisplayBounds | null {
  if (![width, height, dpr].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const scale = Math.min(2, Math.max(1, dpr),
    limits.maxWidth / width, limits.maxHeight / height);
  return {
    width: evenClamped(width * scale, limits.minWidth, limits.maxWidth),
    height: evenClamped(height * scale, limits.minHeight, limits.maxHeight)
  };
}

/**
 * Pointer coordinates account for letterboxing (contain) or clipped video
 * edges (cover). No camera/desktop coordinates are ever accepted from Web.
 */
export function remoteVideoPoint(
  surface: Geometry, video: DisplayBounds,
  clientX: number, clientY: number, fit: VideoFit, clamp: boolean
): UnitPoint | undefined {
  if (
    surface.width <= 0 || surface.height <= 0 ||
    video.width <= 0 || video.height <= 0
  ) return undefined;
  const scale = (fit === "cover" ? Math.max : Math.min)(
    surface.width / video.width, surface.height / video.height
  );
  const width = video.width * scale;
  const height = video.height * scale;
  const left = surface.left + (surface.width - width) / 2;
  const top = surface.top + (surface.height - height) / 2;
  let x = (clientX - left) / width;
  let y = (clientY - top) / height;
  if (!clamp && (x < 0 || x > 1 || y < 0 || y > 1)) return undefined;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  return { x, y };
}

/** Map an owned-window normalized cursor into the visible, possibly cropped video. */
export function remoteVideoCursorPosition(
  surface: Geometry, video: DisplayBounds, cursor: UnitPoint, fit: VideoFit
): UnitPoint | undefined {
  if (surface.width <= 0 || surface.height <= 0 ||
      video.width <= 0 || video.height <= 0 ||
      !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y) ||
      cursor.x < 0 || cursor.x > 1 || cursor.y < 0 || cursor.y > 1) return undefined;
  const scale = (fit === "cover" ? Math.max : Math.min)(
    surface.width / video.width, surface.height / video.height
  );
  const width = video.width * scale;
  const height = video.height * scale;
  const x = (surface.width - width) / 2 + cursor.x * width;
  const y = (surface.height - height) / 2 + cursor.y * height;
  if (x < 0 || x > surface.width || y < 0 || y > surface.height) return undefined;
  return { x, y };
}

/** Keep finger-to-preview cursor travel stable in contain and cropped cover modes. */
export function remoteTouchpadDelta(
  motion: UnitPoint, surface: DisplayBounds, video: DisplayBounds,
  fit: VideoFit, gain = 1.6
): UnitPoint {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  if (surface.width <= 0 || surface.height <= 0 ||
      video.width <= 0 || video.height <= 0) {
    return { x: clamp(motion.x * gain), y: clamp(motion.y * gain) };
  }
  const scale = (fit === "cover" ? Math.max : Math.min)(
    surface.width / video.width, surface.height / video.height
  );
  return {
    x: clamp((motion.x * surface.width / (video.width * scale)) * gain),
    y: clamp((motion.y * surface.height / (video.height * scale)) * gain)
  };
}
