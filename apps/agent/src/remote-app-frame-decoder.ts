import { Buffer } from "node:buffer";

const HEADER_BYTES = 16;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

/**
 * Single-allocation, bounded parser for native PTF1 RGBA frames.
 * Native stdout arrives in arbitrary chunks: repeatedly Buffer.concat-ing
 * partial 6 MiB frames makes one frame quadratic in copied bytes.
 */
export class RemoteAppFrameDecoder {
  private readonly header = Buffer.alloc(HEADER_BYTES);
  private headerLength = 0;
  private payload: Buffer | undefined;
  private payloadLength = 0;
  private width = 0;
  private height = 0;

  reset(): void {
    this.headerLength = 0;
    this.payload = undefined;
    this.payloadLength = 0;
    this.width = 0;
    this.height = 0;
  }

  push(chunk: Buffer, onFrame: (rgba: Buffer, width: number, height: number) => void): void {
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.payload) {
        const count = Math.min(HEADER_BYTES - this.headerLength, chunk.length - offset);
        chunk.copy(this.header, this.headerLength, offset, offset + count);
        this.headerLength += count;
        offset += count;
        if (this.headerLength < HEADER_BYTES) return;

        const width = this.header.readUInt32LE(4);
        const height = this.header.readUInt32LE(8);
        const length = this.header.readUInt32LE(12);
        if (
          this.header.toString("ascii", 0, 4) !== "PTF1" ||
          width < 2 || height < 2 || width > 1600 || height > 1000 ||
          (width & 1) !== 0 || (height & 1) !== 0 ||
          length !== width * height * 4 || length > MAX_FRAME_BYTES
        ) {
          this.reset();
          throw new Error("invalid-frame");
        }
        this.width = width;
        this.height = height;
        this.payload = Buffer.allocUnsafe(length);
        this.payloadLength = 0;
      }
      const payload = this.payload;
      const count = Math.min(payload.length - this.payloadLength, chunk.length - offset);
      chunk.copy(payload, this.payloadLength, offset, offset + count);
      this.payloadLength += count;
      offset += count;
      if (this.payloadLength === payload.length) {
        const width = this.width;
        const height = this.height;
        this.reset();
        onFrame(payload, width, height);
      }
    }
  }
}
