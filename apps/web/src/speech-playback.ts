import { nextSpeechChunk } from "./speech-segments.js";

export type ReaderPlaybackState = "idle" | "preparing" | "playing" | "paused" | "completed" | "error";
export interface SpeechOutput {
  speak(text: string, signal: AbortSignal, onPlaying: () => void): Promise<void>;
  prefetch?(text: string, signal: AbortSignal): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export class ReaderPlayback {
  private generation = 0;
  private controller: AbortController | null = null;
  private output: SpeechOutput | null = null;
  private paused = false;
  private state: ReaderPlaybackState = "idle";

  constructor(
    private readonly onState: (state: ReaderPlaybackState) => void,
    private readonly onPosition: (paragraph: number, offset: number) => void
  ) {}

  get currentState(): ReaderPlaybackState { return this.state; }
  private publish(next: ReaderPlaybackState): void {
    this.state = next;
    this.onState(next);
  }

  stop(): void {
    ++this.generation;
    this.controller?.abort();
    this.controller = null;
    this.output?.stop();
    this.output = null;
    this.paused = false;
    this.publish("idle");
  }

  pause(): void {
    if (!this.output || this.state !== "playing") return;
    this.output.pause();
    this.paused = true;
    this.publish("paused");
  }

  resume(): void {
    if (!this.output || this.state !== "paused") return;
    this.output.resume();
    this.paused = false;
    this.publish("playing");
  }

  async start(
    paragraphs: readonly string[],
    firstParagraph: number,
    output: SpeechOutput,
    segmentLimit: number,
    firstOffset = 0
  ): Promise<void> {
    this.stop();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.output = output;
    this.publish("preparing");
    try {
      for (let index = firstParagraph; index < paragraphs.length; index++) {
        const paragraph = paragraphs[index] ?? "";
        let offset = index === firstParagraph ? firstOffset : 0;
        while (offset < paragraph.length) {
          if (controller.signal.aborted || generation !== this.generation) return;
          const chunk = nextSpeechChunk(paragraph, offset, segmentLimit);
          if (!chunk || chunk.nextOffset <= offset) throw new Error("Invalid speech segment");
          offset = chunk.nextOffset;
          if (!chunk.text) continue;
          this.onPosition(index, chunk.startOffset);
          if (!this.paused) this.publish("preparing");
          const next = nextSpeechChunk(paragraph, offset, segmentLimit) ??
            nextSpeechChunk(paragraphs[index + 1] ?? "", 0, segmentLimit);
          await output.speak(chunk.text, controller.signal, () => {
            if (controller.signal.aborted || generation !== this.generation) return;
            this.publish("playing");
            if (next?.text) output.prefetch?.(next.text, controller.signal);
          });
          if (controller.signal.aborted || generation !== this.generation) return;
        }
      }
      this.publish("completed");
    } catch (error) {
      if (!controller.signal.aborted && generation === this.generation) {
        this.publish("error");
        throw error;
      }
    } finally {
      if (generation === this.generation) {
        this.controller = null;
        this.output?.stop();
        this.output = null;
        this.paused = false;
      }
    }
  }
}

export class BrowserSpeechOutput implements SpeechOutput {
  private active: SpeechSynthesisUtterance | null = null;

  constructor(
    private readonly synth: SpeechSynthesis,
    private readonly voice: SpeechSynthesisVoice,
    private readonly rate: number,
    private readonly pitch: number,
    private readonly volume: number
  ) {}

  speak(text: string, signal: AbortSignal, onPlaying: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
      const utterance = new SpeechSynthesisUtterance(text);
      this.active = utterance;
      utterance.voice = this.voice;
      utterance.lang = this.voice.lang;
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      utterance.volume = this.volume;
      const cleanup = () => {
        signal.removeEventListener("abort", cancel);
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        if (this.active === utterance) this.active = null;
      };
      const cancel = () => {
        cleanup();
        this.synth.cancel();
        reject(new DOMException("Cancelled", "AbortError"));
      };
      signal.addEventListener("abort", cancel, { once: true });
      utterance.onstart = () => { onPlaying(); };
      utterance.onend = () => { cleanup(); resolve(); };
      utterance.onerror = (event) => {
        cleanup();
        reject(new Error(event.error || "Speech synthesis failed"));
      };
      this.synth.speak(utterance);
    });
  }

  pause(): void { this.synth.pause(); }
  resume(): void { this.synth.resume(); }
  stop(): void { this.synth.cancel(); this.active = null; }
}

export class QwenSpeechOutput implements SpeechOutput {
  private readonly pending = new Map<string, Promise<Blob>>();
  private readonly cache = new Map<string, Blob>();
  private bytes = 0;
  private player: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;

  constructor(
    private readonly synthesize: (text: string, signal: AbortSignal) => Promise<Blob>,
    private readonly rate: number
  ) {}

  private getAudio(text: string, signal: AbortSignal): Promise<Blob> {
    const cached = this.cache.get(text);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(text);
    if (pending) return pending;
    const promise = this.synthesize(text, signal).then((blob) => {
      if (blob.size > 0 && blob.size <= 4 * 1024 * 1024 && !signal.aborted) {
        while (this.bytes + blob.size > 12 * 1024 * 1024 && this.cache.size) {
          const oldest = this.cache.keys().next().value;
          if (oldest === undefined) break;
          this.bytes -= this.cache.get(oldest)?.size ?? 0;
          this.cache.delete(oldest);
        }
        this.cache.set(text, blob);
        this.bytes += blob.size;
      }
      return blob;
    }).finally(() => { this.pending.delete(text); });
    this.pending.set(text, promise);
    return promise;
  }

  prefetch(text: string, signal: AbortSignal): void {
    // Prefetch shares the playback cancellation signal and never allocates a full-book queue.
    void this.getAudio(text, signal).catch(() => undefined);
  }

  async speak(text: string, signal: AbortSignal, onPlaying: () => void): Promise<void> {
    const blob = await this.getAudio(text, signal);
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const url = URL.createObjectURL(blob);
    this.currentUrl = url;
    const player = new Audio(url);
    this.player = player;
    player.playbackRate = this.rate;
    player.preload = "auto";
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          player.removeEventListener("ended", ended);
          player.removeEventListener("error", failed);
          signal.removeEventListener("abort", abort);
        };
        const ended = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Audio playback failed")); };
        const abort = () => {
          cleanup();
          player.pause();
          reject(new DOMException("Cancelled", "AbortError"));
        };
        player.addEventListener("ended", ended, { once: true });
        player.addEventListener("error", failed, { once: true });
        signal.addEventListener("abort", abort, { once: true });
        void player.play().then(() => { if (!signal.aborted) onPlaying(); }).catch((error: unknown) => { cleanup(); reject(error); });
      });
    } finally {
      player.pause();
      player.removeAttribute("src");
      player.load();
      if (this.player === player) this.player = null;
      URL.revokeObjectURL(url);
      if (this.currentUrl === url) this.currentUrl = null;
    }
  }

  pause(): void { this.player?.pause(); }
  resume(): void { if (this.player) void this.player.play(); }
  stop(): void {
    this.player?.pause();
    this.player = null;
    if (this.currentUrl) URL.revokeObjectURL(this.currentUrl);
    this.currentUrl = null;
    this.pending.clear();
    this.cache.clear();
    this.bytes = 0;
  }
}
