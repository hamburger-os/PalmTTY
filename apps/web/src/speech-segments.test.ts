import { describe, expect, it } from "vitest";
import {
  MAX_READER_PARAGRAPHS,
  MAX_SPEECH_SEGMENT_LENGTH,
  nextSpeechChunk,
  speechParagraphs
} from "./speech-segments.js";

describe("novel speech segmentation", () => {
  it("preserves indentation and filters blank paragraphs", () => {
    expect(speechParagraphs("One\n\n Two\nThree").paragraphs)
      .toEqual(["One", " Two", "Three"]);
  });

  it("segments Unicode text lazily without losing surrogate pairs", () => {
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

  it("short-circuits pathological files with too many paragraphs", () => {
    const source = "短\n".repeat(MAX_READER_PARAGRAPHS + 100);
    const result = speechParagraphs(source);
    expect(result.tooMany).toBe(true);
    expect(result.paragraphs).toHaveLength(0);
  });

  it("has no segments for empty text", () => {
    expect(speechParagraphs(" \n \r\n ")).toEqual({ paragraphs: [], tooMany: false });
    expect(nextSpeechChunk("", 0)).toBeNull();
  });
});
