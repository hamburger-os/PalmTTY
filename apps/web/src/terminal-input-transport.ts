// One ordered browser-to-PTY input stream. WebSocket text frames carry UTF-8,
// so split at Unicode scalar boundaries rather than JavaScript code units.
// 12 KiB also bounds worst-case JSON control-character escaping below the
// 80 KiB WebSocket message limit (each ASCII control may encode as six bytes).
export const TERMINAL_INPUT_CHUNK_BYTES = 12 * 1024;
export const MAX_QUEUED_TERMINAL_INPUT_BYTES = 8 * 1024 * 1024;
const SOCKET_HIGH_WATER_BYTES = 128 * 1024;

export type TerminalInputFailure = "overflow" | "interrupted" | "sendFailed";

export type TerminalInputSocket = Pick<WebSocket, "readyState" | "bufferedAmount" | "send">;

export function utf8InputBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function splitUtf8Input(value: string, maxBytes = TERMINAL_INPUT_CHUNK_BYTES): string[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 4) {
    throw new RangeError("Terminal input chunk limit must be at least four bytes");
  }
  if (value.length === 0) return [];
  if (utf8InputBytes(value) <= maxBytes) return [value];

  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;
  for (let index = 0; index < value.length;) {
    const point = value.codePointAt(index)!;
    const width = point > 0xffff ? 2 : 1;
    const pointBytes = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes + pointBytes > maxBytes) {
      chunks.push(value.slice(start, index));
      start = index;
      bytes = 0;
    }
    bytes += pointBytes;
    index += width;
  }
  if (start < value.length) chunks.push(value.slice(start));
  return chunks;
}

// xterm's onBinary is an 8-bit byte string. node-pty.write only accepts UTF-8
// strings, so 0x80..0xff cannot be forwarded byte-for-byte over this transport.
// ASCII-only legacy reports are safe; reject the rest instead of corrupting them.
export function asciiBinaryInput(value: string): string | undefined {
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) > 0x7f) return undefined;
  }
  return value;
}

export function isSgrMouseReport(value: string): boolean {
  return /^\x1b\[<\d+;\d+;\d+[Mm]$/.test(value);
}

export class TerminalInputQueue {
  private readonly pending: { data: string; bytes: number }[] = [];
  private pendingBytes = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly socket: TerminalInputSocket,
    private readonly onFailure: (failure: TerminalInputFailure) => void
  ) {}

  canAccept(bytes: number): boolean {
    return !this.stopped && this.socket.readyState === 1 &&
      Number.isFinite(bytes) && bytes >= 0 &&
      this.pendingBytes + bytes <= MAX_QUEUED_TERMINAL_INPUT_BYTES;
  }

  enqueue(data: string): boolean {
    if (this.stopped || this.socket.readyState !== 1) return false;
    if (!data) return true;
    const total = utf8InputBytes(data);
    if (!this.canAccept(total)) {
      this.onFailure("overflow");
      return false;
    }
    for (const chunk of splitUtf8Input(data)) {
      const bytes = utf8InputBytes(chunk);
      this.pending.push({ data: chunk, bytes });
      this.pendingBytes += bytes;
    }
    this.drain();
    return !this.stopped;
  }

  abort(reportInterrupted = false): void {
    if (this.stopped) return;
    const interrupted = this.pending.length > 0;
    this.stopped = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.length = 0;
    this.pendingBytes = 0;
    if (reportInterrupted && interrupted) this.onFailure("interrupted");
  }

  private drain(): void {
    this.timer = undefined;
    if (this.stopped) return;
    if (this.socket.readyState !== 1) {
      this.abort(true);
      return;
    }
    try {
      while (this.pending.length && this.socket.bufferedAmount < SOCKET_HIGH_WATER_BYTES) {
        const chunk = this.pending.shift()!;
        this.socket.send(JSON.stringify({ type: "input", data: chunk.data }));
        this.pendingBytes -= chunk.bytes;
      }
    } catch {
      this.abort();
      this.onFailure("sendFailed");
      return;
    }
    if (this.pending.length) {
      this.timer = setTimeout(() => this.drain(), 40);
    }
  }
}
