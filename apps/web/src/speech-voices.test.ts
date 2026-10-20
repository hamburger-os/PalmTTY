import { describe, expect, it } from "vitest";
import {
  chineseSpeechVoices, isChineseSpeechLanguage, mayUseRemoteSpeech,
  selectInitialVoice, voiceOrigin
} from "./speech-voices.js";

describe("browser Chinese-only speech voices", () => {
  const voices = [
    { voiceURI: "en", name: "中文测试 / English voice", localService: true, lang: "en-US" },
    { voiceURI: "remote-zh", name: "Online Mandarin", localService: false, lang: "zh-CN" },
    { voiceURI: "unknown-ja", name: "Japanese", localService: undefined, lang: "ja-JP" },
    { voiceURI: "local-zh", name: "普通话", localService: true, lang: "zh-Hans-CN" },
    { voiceURI: "cantonese", name: "Cantonese", localService: false, lang: "yue-HK" },
    { voiceURI: "traditional", name: "Taiwanese Mandarin", localService: true, lang: "zh-TW" }
  ];

  it("keeps Chinese language tags including Mandarin and Cantonese", () => {
    for (const language of [
      "zh", "zh-CN", "zh-TW", "zh-HK", "zh-Hans-CN", "zh_Hant_TW",
      "cmn-Hans-CN", "yue-HK", "wuu-CN", "nan-TW", "hak-TW", "gan-CN", "hsn-CN"
    ]) {
      expect(isChineseSpeechLanguage(language)).toBe(true);
    }
  });

  it("excludes foreign-language voices even when their names mention Chinese", () => {
    for (const language of ["", "en-US", "en-CN", "ja-JP", "ko-KR", "fr-FR", "zhongwen", "en-zh"]) {
      expect(isChineseSpeechLanguage(language)).toBe(false);
    }
    expect(chineseSpeechVoices(voices).map((voice) => voice.voiceURI)).toEqual([
      "remote-zh", "local-zh", "cantonese", "traditional"
    ]);
  });

  it("defaults to a local Chinese voice and rejects previously saved English voices", () => {
    expect(selectInitialVoice(voices, "")).toBe("local-zh");
    expect(selectInitialVoice(voices, "en")).toBe("local-zh");
    expect(selectInitialVoice(voices, "remote-zh")).toBe("remote-zh");
    expect(selectInitialVoice(voices, "unknown-ja")).toBe("local-zh");
    expect(selectInitialVoice(voices.slice(0, 1), "")).toBe("");
    expect(selectInitialVoice(voices.slice(0, 2), "")).toBe("");
    expect(selectInitialVoice([], "remote-zh")).toBe("remote-zh");
  });

  it("does not silently fall back to online voices if no local Chinese voice exists", () => {
    const remoteOnly = chineseSpeechVoices(voices).filter((voice) => !voice.localService);
    expect(selectInitialVoice(remoteOnly, "")).toBe("");
    expect(selectInitialVoice(remoteOnly, "en")).toBe("");
    expect(selectInitialVoice(remoteOnly, "remote-zh")).toBe("remote-zh");
  });

  it("preserves remote origin classification and per-voice consent boundary", () => {
    const chinese = chineseSpeechVoices(voices);
    expect(chinese.map(voiceOrigin)).toEqual(["remote", "local", "remote", "local"]);
    expect(chinese.map(mayUseRemoteSpeech)).toEqual([true, false, true, false]);
    expect(voiceOrigin({ localService: undefined })).toBe("unknown");
    expect(mayUseRemoteSpeech({ localService: undefined })).toBe(true);
  });
});
