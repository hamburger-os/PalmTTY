import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_QUEUED_TERMINAL_INPUT_BYTES,
  TerminalInputQueue,
  asciiBinaryInput,
  isSgrMouseReport,
  splitUtf8Input,
  utf8InputBytes
} from "./terminal-input-transport.js";

function fakeSocket() {
  const sent: string[] = [];
  const socket = {
    readyState: 1 as WebSocket["readyState"],
    bufferedAmount: 0,
    send(data: string) {
      sent.push(JSON.parse(data).data as string);
      this.bufferedAmount += utf8InputBytes(data);
    }
  };
  return { socket, sent };
}

afterEach(() => vi.useRealTimers());

describe("terminal input transport", () => {
  it("splits Chinese and emoji by UTF-8 bytes without cutting surrogate pairs", () => {
    const content = "序章📖人物。".repeat(5000);
    const chunks = splitUtf8Input(content);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(content);
    expect(chunks.every(part => utf8InputBytes(part) <= 12 * 1024)).toBe(true);
    expect(splitUtf8Input("abc")).toEqual(["abc"]);
    expect(splitUtf8Input("")).toEqual([]);
    expect(() => splitUtf8Input("hello", 3)).toThrow(RangeError);
  });

  it("keeps JSON-escaped control-heavy input below the 80 KiB WebSocket frame cap", () => {
    for (const chunk of splitUtf8Input("\u0000".repeat(26000))) {
      expect(utf8InputBytes(JSON.stringify({ type: "input", data: chunk })))
        .toBeLessThanOrEqual(80 * 1024);
    }
  });

  it("streams bracketed paste and following Enter in order under backpressure", () => {
    vi.useFakeTimers();
    const { socket, sent } = fakeSocket();
    const failures: string[] = [];
    const input = "\u001b[200~" + "小说📖".repeat(28000) + "\u001b[201~";
    const queue = new TerminalInputQueue(socket, failure => failures.push(failure));
    expect(queue.enqueue(input)).toBe(true);
    expect(queue.enqueue("\r")).toBe(true);
    expect(sent.length).toBeLessThan(splitUtf8Input(input).length + 1);
    let rounds = 0;
    while (sent.join("").length !== input.length + 1 && rounds++ < 100) {
      socket.bufferedAmount = 0;
      vi.advanceTimersByTime(40);
    }
    expect(sent.join("")).toBe(input + "\r");
    expect(sent.every(part => utf8InputBytes(part) <= 12 * 1024)).toBe(true);
    expect(failures).toEqual([]);
    queue.abort();
  });

  it("bounds queued input and drops unsent bytes when the socket closes", () => {
    vi.useFakeTimers();
    const { socket, sent } = fakeSocket();
    socket.bufferedAmount = 130 * 1024;
    const failures: string[] = [];
    const queue = new TerminalInputQueue(socket, failure => failures.push(failure));
    expect(queue.canAccept(MAX_QUEUED_TERMINAL_INPUT_BYTES + 1)).toBe(false);
    expect(queue.enqueue("a".repeat(MAX_QUEUED_TERMINAL_INPUT_BYTES + 1))).toBe(false);
    expect(failures).toEqual(["overflow"]);
    expect(queue.enqueue("待发送".repeat(10000))).toBe(true);
    socket.readyState = 3;
    vi.advanceTimersByTime(40);
    expect(failures).toEqual(["overflow", "interrupted"]);
    expect(sent).toEqual([]);
    expect(queue.enqueue("not replayed")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed when send throws", () => {
    const failures: string[] = [];
    const queue = new TerminalInputQueue(
      { readyState: 1, bufferedAmount: 0, send() { throw new Error("closed"); } },
      failure => failures.push(failure)
    );
    expect(queue.enqueue("hello")).toBe(false);
    expect(failures).toEqual(["sendFailed"]);
    expect(queue.enqueue("again")).toBe(false);
  });

  it("passes ASCII binary reports but does not corrupt high-bit legacy mouse bytes", () => {
    expect(asciiBinaryInput("\u001b[M !!")).toBe("\u001b[M !!");
    expect(asciiBinaryInput("\u001b[M \u0080!")).toBeUndefined();
    expect(isSgrMouseReport("\u001b[<0;12;6M")).toBe(true);
    expect(isSgrMouseReport("\u001b[<0;12;6m")).toBe(true);
    expect(isSgrMouseReport("\u001b[A")).toBe(false);
  });
});
