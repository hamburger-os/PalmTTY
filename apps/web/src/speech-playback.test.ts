import { describe, expect, it, vi } from "vitest";
import { ReaderPlayback, type ReaderPlaybackState, type SpeechOutput } from "./speech-playback.js";

describe("single reader playback owner", () => {
  it("reads bounded chunks in order and completes", async () => {
    const texts: string[] = [];
    const states: ReaderPlaybackState[] = [];
    const positions: [number, number][] = [];
    const output: SpeechOutput = {
      async speak(text) { texts.push(text); },
      pause() {}, resume() {}, stop() {}
    };
    const reader = new ReaderPlayback((s) => states.push(s), (p, offset) => positions.push([p, offset]));
    await reader.start(["第一段。", "第二段。"], 0, output, 180);
    expect(texts).toEqual(["第一段。", "第二段。"]);
    expect(positions).toEqual([[0, 0], [1, 0]]);
    expect(states.at(-1)).toBe("completed");
  });

  it("resumes a gesture-blocked audio track without restarting synthesis", async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    let blocked: (() => void) | undefined;
    const output: SpeechOutput = {
      speak(_text, _signal, onPlaying, onBlocked) {
        started = onPlaying;
        blocked = onBlocked;
        return new Promise<void>((resolve) => { release = resolve; });
      },
      pause() {},
      resume() { started?.(); release?.(); },
      stop() {}
    };
    const reader = new ReaderPlayback(() => undefined, () => undefined);
    const run = reader.start(["这是一段朗读。"], 0, output, 180);
    blocked?.();
    expect(reader.currentState).toBe("paused");
    reader.resume();
    await run;
    expect(reader.currentState).toBe("completed");
  });

  it("prevents a stale completion from advancing after stop", async () => {
    let release: (() => void) | undefined;
    const output: SpeechOutput = {
      speak: () => new Promise<void>((resolve) => { release = resolve; }),
      pause: vi.fn(), resume: vi.fn(), stop: vi.fn()
    };
    const states: ReaderPlaybackState[] = [];
    const reader = new ReaderPlayback((s) => states.push(s), () => undefined);
    const run = reader.start(["内容"], 0, output, 180);
    reader.stop();
    release?.();
    await run;
    expect(reader.currentState).toBe("idle");
    expect(states.at(-1)).toBe("idle");
  });
});
