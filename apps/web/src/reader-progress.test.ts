import { describe, expect, it } from "vitest";
import {
  readerChapters, readerProgressKey, readerTextSignature, savedReaderParagraph
} from "./reader-progress.js";

describe("private reader progress and chapter navigation", () => {
  it("recognizes Chinese and English headings and preserves positions", () => {
    expect(readerChapters(["序言", "第一章 重逢", "正文", "Chapter 2", "尾声"])).toEqual([
      { paragraph: 0, title: "" },
      { paragraph: 1, title: "第一章 重逢" },
      { paragraph: 3, title: "Chapter 2" }
    ]);
  });
  it("rejects invalid/stale indices and does not put paths into storage keys", () => {
    const signature = readerTextSignature("这是一篇小说");
    expect(savedReaderParagraph(JSON.stringify({ signature, paragraph: 2 }),signature,4)).toBe(2);
    expect(savedReaderParagraph(JSON.stringify({ signature, paragraph: 4 }),signature,4)).toBeNull();
    expect(savedReaderParagraph(JSON.stringify({ signature: "old", paragraph: 2 }),signature,4)).toBeNull();
    expect(savedReaderParagraph("nonsense",signature,4)).toBeNull();
    expect(readerProgressKey("secret/novel.txt")).not.toContain("secret");
  });
  it("bounds chapter options on a large novel", () => {
    const chapters=readerChapters(Array.from({length:1000},(_,i)=>`第${i+1}章`));
    expect(chapters).toHaveLength(256);
  });
});
