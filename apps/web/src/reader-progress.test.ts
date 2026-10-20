import { describe, expect, it } from "vitest";
import {
  readerChapters, readerProgressKey, readerTextSignature, savedReaderPosition
} from "./reader-progress.js";

describe("private novel reading progress", () => {
  it("recognizes Chinese and English chapter headings", () => {
    expect(readerChapters(["序言", "第一章 重逢", "正文", "Chapter 2", "尾声"])).toEqual([
      { paragraph: 0, title: "" },
      { paragraph: 1, title: "第一章 重逢" },
      { paragraph: 3, title: "Chapter 2" }
    ]);
  });
  it("validates paragraph and UTF-16 offsets without persisting paths", () => {
    const content = ["你好", "世界"];
    const signature = readerTextSignature(content.join("\n"));
    expect(savedReaderPosition(JSON.stringify({ signature, paragraph: 0, offset: 1 }), signature, content))
      .toEqual({ paragraph: 0, offset: 1 });
    expect(savedReaderPosition(JSON.stringify({ signature, paragraph: 0, offset: 3 }), signature, content))
      .toBeNull();
    expect(savedReaderPosition(JSON.stringify({ signature: "old", paragraph: 0, offset: 1 }), signature, content))
      .toBeNull();
    expect(savedReaderPosition("invalid", signature, content)).toBeNull();
    expect(readerProgressKey("secret/novel.txt")).not.toContain("secret");
  });
  it("fingerprints changes throughout the document", () => {
    const x = "a".repeat(1024);
    const y = x.slice(0, 300) + "b" + x.slice(301);
    expect(readerTextSignature(x)).not.toBe(readerTextSignature(y));
  });
  it("bounds chapter navigation", () => {
    expect(readerChapters(Array.from({ length: 1000 }, (_, i) => `第${i + 1}章`)))
      .toHaveLength(256);
  });
});
