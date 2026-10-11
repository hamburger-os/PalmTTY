// Reader metadata contains only opaque keys, a lightweight content signature
// and a paragraph number. Never persist the text itself to browser storage.
function hashText(value: string): string {
  let valueHash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    valueHash = Math.imul(valueHash ^ value.charCodeAt(i), 16777619);
  }
  return (valueHash >>> 0).toString(16);
}

export type ReaderChapter = { paragraph: number; title: string };
export function readerChapters(paragraphs: readonly string[]): ReaderChapter[] {
  const chapters: ReaderChapter[] = [];
  const heading = /^\s*(?:第[零〇一二两三四五六七八九十百千万\d]+[章节回卷]|chapter\s+\d+)(?:\s*[^\r\n]*)?$/iu;
  for (let i = 0; i < paragraphs.length && chapters.length < 256; i++) {
    const text = paragraphs[i]!.trim();
    if (text.length <= 90 && heading.test(text)) {
      chapters.push({ paragraph: i, title: text });
    }
  }
  if (chapters.length === 0 || chapters[0]!.paragraph !== 0) {
    chapters.unshift({ paragraph: 0, title: "" });
  }
  return chapters;
}

export function readerProgressKey(sourceId: string): string {
  return "palmtty.reader.progress." + hashText(sourceId);
}

export function readerTextSignature(text: string): string {
  const sample = text.slice(0, 256) + text.slice(Math.floor(text.length / 2), Math.floor(text.length / 2) + 256) + text.slice(-256);
  return text.length + ":" + hashText(sample);
}

export function savedReaderParagraph(
  stored: string | null, signature: string, paragraphCount: number
): number | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (entry.signature !== signature || !Number.isSafeInteger(entry.paragraph) ||
        (entry.paragraph as number) < 0 || (entry.paragraph as number) >= paragraphCount) {
      return null;
    }
    return entry.paragraph as number;
  } catch {
    return null;
  }
}
