export type VoiceOrigin = "local" | "remote" | "unknown";

export function voiceOrigin(voice: Pick<SpeechSynthesisVoice, "localService">): VoiceOrigin {
  if (voice.localService === true) return "local";
  if (voice.localService === false) return "remote";
  return "unknown";
}

export function selectInitialVoice<T extends Pick<SpeechSynthesisVoice, "voiceURI" | "localService" | "lang">>(
  voices: readonly T[], preferred: string
): string {
  if (preferred && voices.some((voice) => voice.voiceURI === preferred)) return preferred;
  const local = voices.filter((voice) => voiceOrigin(voice) === "local");
  return (local.find((voice) => /^zh(?:-|_)/i.test(voice.lang)) ?? local[0])?.voiceURI ?? "";
}

export function mayUseRemoteSpeech(voice: Pick<SpeechSynthesisVoice, "localService">): boolean {
  return voiceOrigin(voice) !== "local";
}
