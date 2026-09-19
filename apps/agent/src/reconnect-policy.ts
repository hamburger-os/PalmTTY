export function canReplayFrom(
  lastSeq: number,
  latestSeq: number,
  firstRetainedSeq: number | undefined
): boolean {
  if (lastSeq <= 0) return false;
  if (lastSeq > latestSeq) return false;
  if (lastSeq === latestSeq) return true;
  if (firstRetainedSeq === undefined) return false;
  return lastSeq >= firstRetainedSeq - 1;
}
