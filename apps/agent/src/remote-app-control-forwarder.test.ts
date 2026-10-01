import { describe, expect, it } from "vitest";
import {
  RemoteAppControlForwarder, type RemoteAppControlSink
} from "./remote-app-control-forwarder.js";

class FakeSink implements RemoteAppControlSink {
  destroyed = false;
  readonly received: string[] = [];
  private blocked = false;
  private drainListener: (() => void) | undefined;
  write(value: string): boolean {
    this.received.push(value);
    if (!this.blocked) {
      this.blocked = true;
      return false;
    }
    return true;
  }
  once(event: "drain", fn: () => void): void {
    expect(event).toBe("drain");
    this.drainListener = fn;
  }
  off(event: "drain", fn: () => void): void {
    expect(event).toBe("drain");
    if (this.drainListener === fn) this.drainListener = undefined;
  }
  drain(): void {
    this.blocked = false;
    const listener = this.drainListener;
    this.drainListener = undefined;
    listener?.();
  }
}

describe("bounded Remote App native control forwarder", () => {
  it("waits for drain without losing or reordering accepted controls", () => {
    const sink = new FakeSink();
    const queue = new RemoteAppControlForwarder(sink);
    expect(queue.enqueue('{"type":"text","text":"hello"}\n')).toBe(true);
    expect(queue.enqueue('{"type":"keyRepeat","key":"Backspace","count":10}\n')).toBe(true);
    expect(sink.received).toHaveLength(1);
    sink.drain();
    expect(sink.received).toEqual([
      '{"type":"text","text":"hello"}\n',
      '{"type":"keyRepeat","key":"Backspace","count":10}\n'
    ]);
    queue.close();
  });
  it("bounds queued controls and drops queued input on shutdown", () => {
    const sink = new FakeSink();
    const queue = new RemoteAppControlForwarder(sink);
    expect(queue.enqueue("first\n")).toBe(true);
    for (let i = 0; i < 128; i++) expect(queue.enqueue("x\n")).toBe(true);
    expect(queue.enqueue("overflow\n")).toBe(false);
    queue.close();
    sink.drain();
    expect(sink.received).toEqual(["first\n"]);
    expect(queue.enqueue("late\n")).toBe(false);
  });
  it("rejects oversized input even if a peer bypasses browser batching", () => {
    const queue = new RemoteAppControlForwarder(new FakeSink());
    expect(queue.enqueue("x".repeat(64 * 1024 + 1))).toBe(false);
  });
});
