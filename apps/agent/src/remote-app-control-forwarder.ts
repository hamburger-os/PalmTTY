// The WebRTC control channel is ordered, but the native helper stdin is a
// Node Writable: write(false) accepts bytes then requires a drain event.
// Never drop subsequent typed input just because writableNeedDrain is set.
// Bound memory and messages so a stalled helper cannot exhaust the worker.
const MAX_QUEUED_BYTES = 64 * 1024;
const MAX_QUEUED_MESSAGES = 128;

export interface RemoteAppControlSink {
  readonly destroyed: boolean;
  write(chunk: string): boolean;
  once(event: "drain", listener: () => void): unknown;
  off(event: "drain", listener: () => void): unknown;
}

export class RemoteAppControlForwarder {
  private readonly pending: string[] = [];
  private pendingBytes = 0;
  private draining = false;
  private closed = false;
  private readonly onDrain = () => {
    if (this.closed) return;
    this.draining = false;
    this.flush();
  };

  constructor(private readonly sink: RemoteAppControlSink) {}

  enqueue(encodedLine: string): boolean {
    if (this.closed || this.sink.destroyed) return false;
    const bytes = Buffer.byteLength(encodedLine, "utf8");
    if (bytes > MAX_QUEUED_BYTES ||
        this.pending.length >= MAX_QUEUED_MESSAGES ||
        this.pendingBytes + bytes > MAX_QUEUED_BYTES) return false;
    this.pending.push(encodedLine);
    this.pendingBytes += bytes;
    this.flush();
    return true;
  }

  discardPending(): void {
    // write(false) was already accepted by the native pipe and cannot be
    // retracted. Never replay subsequent queued input after a locked session.
    this.pending.length = 0;
    this.pendingBytes = 0;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.sink.off("drain", this.onDrain);
    this.discardPending();
    this.draining = false;
  }

  private flush(): void {
    if (this.draining || this.closed || this.sink.destroyed) return;
    while (this.pending.length) {
      const message = this.pending[0];
      if (message === undefined) break;
      const writable = this.sink.write(message);
      this.pending.shift();
      this.pendingBytes -= Buffer.byteLength(message, "utf8");
      if (!writable) {
        this.draining = true;
        this.sink.once("drain", this.onDrain);
        return;
      }
    }
  }
}
