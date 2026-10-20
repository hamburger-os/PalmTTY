import { describe, expect, it } from "vitest";
import { voiceOrigin, selectInitialVoice, mayUseRemoteSpeech } from "./speech-voices.js";

describe("browser voice origin and private default", () => {
  const voices = [
    { voiceURI: "remote", localService: false, lang: "zh-CN" },
    { voiceURI: "unknown", localService: undefined, lang: "en-US" },
    { voiceURI: "local", localService: true, lang: "zh-CN" }
  ];
  it("shows local, remote, and unknown services without hiding any", () => {
    expect(voices.map(voiceOrigin)).toEqual(["remote", "unknown", "local"]);
    expect(mayUseRemoteSpeech(voices[0]!)).toBe(true);
    expect(mayUseRemoteSpeech(voices[1]!)).toBe(true);
    expect(mayUseRemoteSpeech(voices[2]!)).toBe(false);
  });
  it("selects local by default and never implicitly chooses a remote service", () => {
    expect(selectInitialVoice(voices, "")).toBe("local");
    expect(selectInitialVoice(voices.slice(0, 2), "")).toBe("");
    expect(selectInitialVoice(voices, "remote")).toBe("remote");
  });
});
