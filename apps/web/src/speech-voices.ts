export type VoiceOrigin = "local" | "remote" | "unknown";

// Match the primary BCP 47 language subtag, never voice names or region alone.
// Some speech engines report Chinese varieties using their own primary tags.
const CHINESE_SPEECH_LANGUAGES = new Set([
  "zh", "cmn", "yue", "wuu", "nan", "hak", "gan", "hsn"
]);

export function isChineseSpeechLanguage(lang: string): boolean {
  const primary = lang.trim().split(/[-_]/u, 1)[0]?.toLowerCase();
  return primary !== undefined && CHINESE_SPEECH_LANGUAGES.has(primary);
}

export function chineseSpeechVoices<T extends { lang: string }>(voices: readonly T[]): T[] {
  return voices.filter((voice) => isChineseSpeechLanguage(voice.lang));
}

export function voiceOrigin(voice: { localService: boolean | undefined }): VoiceOrigin {
  if (voice.localService === true) return "local";
  if (voice.localService === false) return "remote";
  return "unknown";
}

export function selectInitialVoice<T extends {
  voiceURI: string;
  localService: boolean | undefined;
  lang: string;
}>(voices: readonly T[], preferred: string): string {
  const chinese = chineseSpeechVoices(voices);
  // getVoices() can initially return an empty list on mobile. Keep the saved
  // preference until voiceschanged, but never select an English fallback.
  if (voices.length === 0) return preferred;
  if (preferred && chinese.some((voice) => voice.voiceURI === preferred)) return preferred;
  const local = chinese.filter((voice) => voiceOrigin(voice) === "local");
  return local[0]?.voiceURI ?? "";
}

export function mayUseRemoteSpeech(voice: { localService: boolean | undefined }): boolean {
  return voiceOrigin(voice) !== "local";
}
