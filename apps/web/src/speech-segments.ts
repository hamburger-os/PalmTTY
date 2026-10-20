export const MAX_SPEECH_SEGMENT_LENGTH = 180;
export const MAX_READER_PARAGRAPHS = 20_000;
export const READER_PAGE_SIZE = 120;

export function speechParagraphs(text: string): {
  paragraphs: string[];
  tooMany: boolean;
} {
  const paragraphs: string[] = [];
  // Stop scanning once the safe paragraph bound is reached; split() would
  // eagerly allocate millions of strings for a valid but hostile 8 MiB file.
  const pattern = /[^\r\n]+/gu;
  let inspected = 0;
  for (const match of text.replace(/^\uFEFF/, "").matchAll(pattern)) {
    // Also bound empty/whitespace-only lines, which do not count as paragraphs.
    if (++inspected > MAX_READER_PARAGRAPHS * 2) {
      return { paragraphs: [], tooMany: true };
    }
    const value = match[0].trimEnd();
    if (!value.trim()) continue;
    if (paragraphs.length === MAX_READER_PARAGRAPHS) {
      return { paragraphs: [], tooMany: true };
    }
    paragraphs.push(value);
  }
  return { paragraphs, tooMany: false };
}

// A single bounded utterance at a time, using UTF-16 offsets to avoid
// allocating the entire speech queue for a large chapter.
export function nextSpeechChunk(paragraph: string, offset: number, maxLength = MAX_SPEECH_SEGMENT_LENGTH): {
  text: string;
  startOffset: number;
  nextOffset: number;
} | null {
  if (offset < 0 || offset >= paragraph.length) return null;
  if (!Number.isSafeInteger(maxLength) || maxLength < 64 || maxLength > 320) return null;
  let end = Math.min(offset + maxLength, paragraph.length);
  // Do not cut a surrogate pair at a chunk boundary.
  if (end < paragraph.length) {
    const code = paragraph.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    for (let index = end - 1; index >= offset + 40; index -= 1) {
      if (/[。！？!?；;，,、\s]/u.test(paragraph[index] ?? "")) {
        end = index + 1;
        break;
      }
    }
  }
  const leading = paragraph.slice(offset, end).length - paragraph.slice(offset, end).trimStart().length;
  return { text: paragraph.slice(offset, end).trim(), startOffset: offset + leading, nextOffset: end };
}
