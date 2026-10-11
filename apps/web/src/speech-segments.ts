export type SpeechSegment = { paragraph: number; text: string };
export const MAX_SPEECH_SEGMENT_LENGTH = 180;

export function speechParagraphs(text: string): string[] {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
    .split(/\n+/).map((line) => line.trimEnd()).filter((line) => line.trim().length > 0);
}

// Keep punctuation with the preceding phrase while bounding every browser
// utterance. Split only for playback: the reader still shows whole paragraphs.
export function speechSegments(paragraphs: readonly string[]): SpeechSegment[] {
  const result: SpeechSegment[] = [];
  for (let paragraph = 0; paragraph < paragraphs.length; paragraph += 1) {
    const chars = Array.from(paragraphs[paragraph] ?? "");
    let start = 0;
    while (start < chars.length) {
      let end = Math.min(start + MAX_SPEECH_SEGMENT_LENGTH, chars.length);
      if (end < chars.length) {
        for (let index = end - 1; index >= start + 40; index -= 1) {
          if (/[。！？!?；;，,、\s]/u.test(chars[index] ?? "")) {
            end = index + 1;
            break;
          }
        }
      }
      const text = chars.slice(start, end).join("").trim();
      if (text) result.push({ paragraph, text });
      start = end;
    }
  }
  return result;
}
