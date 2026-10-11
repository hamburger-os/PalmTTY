// Fixed-resource replay storage: removing old records never shifts the array
// on every PTY chunk. A separate frame limit bounds overhead for tiny chunks.
export type ReplayFrame = { seq: number; data: string; bytes: number };

export class ReplayHistory {
  private entries: ReplayFrame[] = [];
  private head = 0;
  private totalBytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly maxFrames = 4096
  ) {}

  get firstSeq(): number | undefined {
    return this.entries[this.head]?.seq;
  }

  push(seq: number, data: string): void {
    const bytes = Buffer.byteLength(data, "utf8");
    this.entries.push({ seq, data, bytes });
    this.totalBytes += bytes;
    while (
      this.head < this.entries.length &&
      (this.totalBytes > this.maxBytes ||
        this.entries.length - this.head > this.maxFrames)
    ) {
      this.totalBytes -= this.entries[this.head]!.bytes;
      this.head++;
    }
    if (this.head > 1024 && this.head * 2 >= this.entries.length) {
      this.entries = this.entries.slice(this.head);
      this.head = 0;
    }
  }

  after(seq: number): ReplayFrame[] {
    const result: ReplayFrame[] = [];
    for (let index = this.head; index < this.entries.length; index++) {
      const frame = this.entries[index]!;
      if (frame.seq > seq) result.push(frame);
    }
    return result;
  }

  clear(): void {
    this.entries = [];
    this.head = 0;
    this.totalBytes = 0;
  }
}
