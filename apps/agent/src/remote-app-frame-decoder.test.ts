import { describe, expect, it } from "vitest";
import { RemoteAppFrameDecoder } from "./remote-app-frame-decoder.js";

function frame(width: number, height: number): Buffer {
  const result = Buffer.alloc(16 + width * height * 4);
  result.write("PTF1", 0, "ascii");
  result.writeUInt32LE(width, 4);
  result.writeUInt32LE(height, 8);
  result.writeUInt32LE(width * height * 4, 12);
  for (let i = 16; i < result.length; i++) result[i] = i % 251;
  return result;
}

describe("Remote App bounded streaming frame parser", () => {
  it("accepts every possible split of a native frame", () => {
    const source = frame(32, 16);
    for (let split = 1; split < source.length; split++) {
      const decoder = new RemoteAppFrameDecoder();
      const received: Buffer[] = [];
      decoder.push(source.subarray(0, split), (bytes) => received.push(bytes));
      decoder.push(source.subarray(split), (bytes) => received.push(bytes));
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(source.subarray(16));
    }
  });

  it("consumes several complete frames in one stdout chunk", () => {
    const decoder = new RemoteAppFrameDecoder();
    const received: number[] = [];
    decoder.push(Buffer.concat([frame(8, 4), frame(6, 6)]), (_, w, h) =>
      received.push(w, h));
    expect(received).toEqual([8, 4, 6, 6]);
  });

  it("rejects malformed/oversized frames and resumes from a clean state", () => {
    const decoder = new RemoteAppFrameDecoder();
    const invalid = frame(8, 4);
    invalid.writeUInt32LE(8 * 1024 * 1024, 12);
    expect(() => decoder.push(invalid, () => undefined)).toThrow("invalid-frame");
    const received: number[] = [];
    decoder.push(frame(2, 2), (_, w) => received.push(w));
    expect(received).toEqual([2]);
  });
});
