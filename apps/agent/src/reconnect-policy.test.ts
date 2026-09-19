import { describe, expect, it } from "vitest";
import { canReplayFrom } from "./reconnect-policy.js";

describe("reconnect replay policy", () => {
  it("uses a snapshot for a fresh browser", () => {
    expect(canReplayFrom(0, 100, 80)).toBe(false);
  });

  it("replays from the retained boundary", () => {
    expect(canReplayFrom(79, 100, 80)).toBe(true);
    expect(canReplayFrom(80, 100, 80)).toBe(true);
  });

  it("falls back to snapshot when the client is too old", () => {
    expect(canReplayFrom(78, 100, 80)).toBe(false);
  });

  it("accepts an already-current client without history", () => {
    expect(canReplayFrom(100, 100, undefined)).toBe(true);
  });

  it("rejects impossible future sequence numbers", () => {
    expect(canReplayFrom(101, 100, 80)).toBe(false);
  });
});
