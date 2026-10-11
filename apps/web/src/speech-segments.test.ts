import { describe, expect, it } from "vitest";
import { MAX_SPEECH_SEGMENT_LENGTH, speechParagraphs, speechSegments } from "./speech-segments.js";

describe("speech segmentation", () => {
  it("normalizes paragraphs", () => {
    expect(speechParagraphs("One\n\n Two\nThree")).toEqual(["One", "Two", "Three"]);
  });
  it("keeps paragraphs and bounds long Unicode utterances", () => {
    const paragraphs = ["你好。".repeat(180), "🙂".repeat(300)];
    const segments = speechSegments(paragraphs);
    expect(segments.every((item) => Array.from(item.text).length <= MAX_SPEECH_SEGMENT_LENGTH)).toBe(true);
    expect(segments.filter((item) => item.paragraph === 0).map((item) => item.text).join("")).toBe(paragraphs[0]);
    expect(segments.filter((item) => item.paragraph === 1).map((item) => item.text).join("")).toBe(paragraphs[1]);
  });
  it("handles empty input", () => {
    expect(speechSegments(speechParagraphs(" \n \n "))).toEqual([]);
  });
});
