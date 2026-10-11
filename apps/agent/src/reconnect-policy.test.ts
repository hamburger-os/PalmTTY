import { describe, expect, it } from "vitest";
import { canReplayFrom, MAX_RECOVERY_REPLAY_BYTES, MAX_RECOVERY_REPLAY_FRAMES } from "./reconnect-policy.js";

describe("reconnect recovery policy", () => {
  it("takes a snapshot for a fresh browser", () => {
    expect(canReplayFrom(0, 100, 80, 21, 512)).toBe(false);
  });
  it("replays only a small continuous interruption", () => {
    expect(canReplayFrom(79, 100, 80, 21, 1024)).toBe(true);
    expect(canReplayFrom(80, 100, 80, 20, 1024)).toBe(true);
    expect(canReplayFrom(100, 100, undefined, 0, 0)).toBe(true);
  });
  it("takes a snapshot when frames or bytes exceed recovery budgets", () => {
    expect(canReplayFrom(50, 200, 1, MAX_RECOVERY_REPLAY_FRAMES + 1, 1024)).toBe(false);
    expect(canReplayFrom(50, 200, 1, 10, MAX_RECOVERY_REPLAY_BYTES + 1)).toBe(false);
    expect(canReplayFrom(50, 200, 1, MAX_RECOVERY_REPLAY_FRAMES, MAX_RECOVERY_REPLAY_BYTES)).toBe(true);
  });
  it("takes a snapshot for stale or invalid sequences", () => {
    expect(canReplayFrom(78, 100, 80, 22, 1024)).toBe(false);
    expect(canReplayFrom(101, 100, 80, 0, 0)).toBe(false);
  });
});
