export const MAX_RECOVERY_REPLAY_FRAMES = 64;
export const MAX_RECOVERY_REPLAY_BYTES = 64 * 1024;

// A short interruption is replayed exactly. A long interruption is restored
// from the canonical headless terminal instead of animating stale output.
export function canReplayFrom(
  lastSeq: number,
  latestSeq: number,
  firstRetainedSeq: number | undefined,
  pendingFrames: number,
  pendingBytes: number
): boolean {
  if (lastSeq <= 0 || lastSeq > latestSeq) return false;
  if (pendingFrames > MAX_RECOVERY_REPLAY_FRAMES ||
      pendingBytes > MAX_RECOVERY_REPLAY_BYTES) return false;
  if (lastSeq === latestSeq) return true;
  if (firstRetainedSeq === undefined) return false;
  return lastSeq >= firstRetainedSeq - 1;
}
