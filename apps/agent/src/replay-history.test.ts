import { describe, expect, it } from "vitest";
import { ReplayHistory } from "./replay-history.js";

describe("bounded replay ring", () => {
  it("evicts old frames by bytes and preserves retained ordering", () => {
    const ring = new ReplayHistory(6);
    ring.push(1, "ab");
    ring.push(2, "cd");
    ring.push(3, "ef");
    ring.push(4, "gh");
    expect(ring.firstSeq).toBe(2);
    expect(ring.after(2).map((frame) => frame.seq)).toEqual([3, 4]);
  });

  it("bounds zero-length and tiny frames independently of bytes", () => {
    const ring = new ReplayHistory(64, 3);
    for (let seq = 1; seq <= 5000; seq++) ring.push(seq, "");
    expect(ring.firstSeq).toBe(4998);
    expect(ring.after(4998).map((frame) => frame.seq)).toEqual([4999, 5000]);
    ring.clear();
    expect(ring.firstSeq).toBeUndefined();
  });

  it("evicts an oversized frame rather than exceeding the budget", () => {
    const ring = new ReplayHistory(2);
    ring.push(1, "你好");
    expect(ring.firstSeq).toBeUndefined();
  });
});
