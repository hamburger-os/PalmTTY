import { describe, expect, it } from "vitest";
import { LIVE_KEYBOARD_SENTINEL, RemoteLiveInputQueue, remoteAppLiveKeyboardKey, shouldCommitRemoteLiveText } from "./remote-app-live-keyboard.js";
import type { RemoteAppControlMessage } from "@palmtty/protocol";

describe("remote app mobile live-keyboard boundary", () => {
  it("keeps the Safari bridge editable using a nonempty sentinel", () => {
    expect(LIVE_KEYBOARD_SENTINEL).toHaveLength(1);
  });
  it("batches text into bounded ordered frames and removes locally unsent characters", () => {
    const queue = new RemoteLiveInputQueue();
    const messages: RemoteAppControlMessage[] = [];
    expect(queue.enqueueText("hello")).toBe(true);
    queue.enqueueDelete("Backspace");
    queue.enqueueText(" world");
    expect(queue.flush((message) => { messages.push(message); return true; })).toBe(true);
    expect(messages).toEqual([{ type: "text", text: "hell world" }]);
    expect(queue.hasPending).toBe(false);
  });
  it("coalesces 70 held Backspace events into three bounded native batches", () => {
    const queue = new RemoteLiveInputQueue();
    const messages: RemoteAppControlMessage[] = [];
    for (let i = 0; i < 70; i++) queue.enqueueDelete("Backspace");
    queue.flush((message) => { messages.push(message); return true; });
    expect(messages).toEqual([
      { type: "keyRepeat", key: "Backspace", count: 32 },
      { type: "keyRepeat", key: "Backspace", count: 32 },
      { type: "keyRepeat", key: "Backspace", count: 6 }
    ]);
  });
  it("maintains character/delete order across frames and preserves unsent drafts", () => {
    const queue = new RemoteLiveInputQueue();
    const messages: RemoteAppControlMessage[] = [];
    queue.enqueueText("中文");
    queue.flush((message) => { messages.push(message); return true; });
    queue.enqueueDelete("Backspace", 3);
    queue.enqueueText("继续");
    expect(queue.flush(() => false)).toBe(false);
    expect(queue.hasPending).toBe(true);
    expect(queue.takeUnsentText()).toBe("继续");
    expect(queue.hasPending).toBe(false);
    expect(messages).toEqual([{ type: "text", text: "中文" }]);
  });
  it("never exceeds the 16 KiB in-flight text budget", () => {
    const queue = new RemoteLiveInputQueue();
    expect(queue.enqueueText("a".repeat(16 * 1024))).toBe(true);
    expect(queue.enqueueText("overflow")).toBe(false);
    expect(queue.takeUnsentText()).toHaveLength(16 * 1024);
  });
  it("defers Chinese IME input and delayed final events until composition flush", () => {
    expect(shouldCommitRemoteLiveText(false, false, false)).toBe(true);
    expect(shouldCommitRemoteLiveText(true, false, false)).toBe(false);
    expect(shouldCommitRemoteLiveText(false, true, false)).toBe(false);
    expect(shouldCommitRemoteLiveText(false, false, true)).toBe(false);
  });
  it("accepts navigation and editing keys without introducing arbitrary commands", () => {
    for (const key of ["Enter", "Tab", "Backspace", "Escape", "ArrowLeft", "Delete"])
      expect(remoteAppLiveKeyboardKey(key)).toBe(key);
    for (const key of ["a", "中", "Unidentified", "Process", "Meta", "F12"])
      expect(remoteAppLiveKeyboardKey(key)).toBeNull();
  });
});
