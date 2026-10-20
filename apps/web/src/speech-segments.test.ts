import { describe, expect, it } from "vitest";
import {
  MAX_READER_PARAGRAPHS, MAX_SPEECH_SEGMENT_LENGTH, nextSpeechChunk, speechParagraphs
} from "./speech-segments.js";

describe("bounded novel segmentation", () => {
  it("preserves indentation and filters blank paragraphs", () => {
    expect(speechParagraphs("One\n\n Two\nThree").paragraphs)
      .toEqual(["One", " Two", "Three"]);
  });
  it("does not cut UTF-16 surrogate pairs or lose non-whitespace text", () => {
    const source = "你好。".repeat(180) + "🙂".repeat(300);
    const chunks: string[] = [];
    let offset = 0;
    while (offset < source.length) {
      const chunk = nextSpeechChunk(source, offset);
      expect(chunk).not.toBeNull();
      if (!chunk) break;
      expect(chunk.nextOffset).toBeGreaterThan(offset);
      expect(Array.from(chunk.text).length).toBeLessThanOrEqual(MAX_SPEECH_SEGMENT_LENGTH);
      chunks.push(chunk.text);
      offset = chunk.nextOffset;
    }
    expect(chunks.join("")).toBe(source);
  });
  it("provides exact original offsets and supports an independent Qwen chunk cap", () => {
    expect(nextSpeechChunk(" 你好。世界", 0, 260)).toEqual({
      text: "你好。世界", startOffset: 1, nextOffset: 6
    });
    expect(nextSpeechChunk("测试", 0, 500)).toBeNull();
  });
  it("short-circuits pathological files with too many paragraphs", () => {
    const source = "短\n".repeat(MAX_READER_PARAGRAPHS + 100);
    expect(speechParagraphs(source)).toEqual({ paragraphs: [], tooMany: true });
  });
  it("never allocates an unbounded whitespace-only scan", () => {
    const source = " \n".repeat(MAX_READER_PARAGRAPHS * 2 + 10);
    expect(speechParagraphs(source).tooMany).toBe(true);
  });
  it("has no chunks for empty text", () => {
    expect(speechParagraphs(" \n \r\n ")).toEqual({ paragraphs: [], tooMany: false });
    expect(nextSpeechChunk("", 0)).toBeNull();
  });
});
