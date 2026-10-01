import type { RemoteAppControlMessage } from "@palmtty/protocol";

const liveKeys = new Set([
  "Backspace", "Delete", "Enter", "Tab", "Escape",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Home", "End", "PageUp", "PageDown"
]);

export function remoteAppLiveKeyboardKey(key: string): string | null {
  return liveKeys.has(key) ? key : null;
}

export function shouldCommitRemoteLiveText(
  composing: boolean, nativeComposing: boolean, finalCompositionPending: boolean
): boolean {
  return !composing && !nativeComposing && !finalCompositionPending;
}

/** Keep a real, editable sentinel so iOS emits repeated deletion input events. */
export const LIVE_KEYBOARD_SENTINEL = "\u200b";
const MAX_QUEUED_TEXT = 16 * 1024;
const MAX_TEXT_CHUNK = 2048;
const MAX_DELETE_REPEAT = 32;
type QueuedInput = { kind: "text"; text: string } |
  { kind: "delete"; key: "Backspace" | "Delete"; count: number };

/**
 * One ordered input pipeline for committed Unicode and repeated edit keys.
 * The bridge does not claim that DataChannel acceptance is a Windows ACK.
 * On backpressure, keep the unsent text available to Long Text.
 */
export class RemoteLiveInputQueue {
  private pending: QueuedInput[] = [];
  private queuedChars = 0;

  get hasPending(): boolean { return this.pending.length > 0; }

  enqueueText(value: string): boolean {
    if (!value) return true;
    if (this.queuedChars + value.length > MAX_QUEUED_TEXT) return false;
    const tail = this.pending[this.pending.length - 1];
    if (tail?.kind === "text" && tail.text.length + value.length <= MAX_TEXT_CHUNK)
      tail.text += value;
    else {
      for (let i = 0; i < value.length; i += MAX_TEXT_CHUNK)
        this.pending.push({ kind: "text", text: value.slice(i, i + MAX_TEXT_CHUNK) });
    }
    this.queuedChars += value.length;
    return true;
  }

  enqueueDelete(key: "Backspace" | "Delete", count = 1): void {
    if (!Number.isInteger(count) || count < 1 || count > 32) return;
    while (count-- > 0) {
      // Delete still-unsent text before emitting remote key events.
      const tail = this.pending[this.pending.length - 1];
      if (key === "Backspace" && tail?.kind === "text") {
        const points = Array.from(tail.text);
        points.pop();
        this.queuedChars -= tail.text.length;
        tail.text = points.join("");
        this.queuedChars += tail.text.length;
        if (!tail.text) this.pending.pop();
        continue;
      }
      if (tail?.kind === "delete" && tail.key === key && tail.count < MAX_DELETE_REPEAT)
        tail.count++;
      else this.pending.push({ kind: "delete", key, count: 1 });
    }
  }

  flush(send: (message: RemoteAppControlMessage) => boolean): boolean {
    while (this.pending.length) {
      const item = this.pending[0];
      const message: RemoteAppControlMessage = item.kind === "text"
        ? { type: "text", text: item.text }
        : { type: "keyRepeat", key: item.key, count: item.count };
      if (!send(message)) return false;
      if (item.kind === "text") this.queuedChars -= item.text.length;
      this.pending.shift();
    }
    return true;
  }

  /** On a disconnected or closed keyboard, do not silently discard words. */
  takeUnsentText(): string {
    const text = this.pending.filter((item): item is Extract<QueuedInput, {kind: "text"}> =>
      item.kind === "text").map(item => item.text).join("");
    this.pending = [];
    this.queuedChars = 0;
    return text;
  }

  clear(): void {
    this.pending = [];
    this.queuedChars = 0;
  }
}
