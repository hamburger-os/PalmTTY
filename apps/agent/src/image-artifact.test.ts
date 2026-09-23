import { describe, expect, it } from "vitest";
import { inspectImageArtifact } from "./image-artifact.js";

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  ]).copy(buffer);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("image artifact validation", () => {
  it("detects trusted image bytes instead of a caller-supplied MIME type", () => {
    expect(inspectImageArtifact(png(320, 180))).toEqual({
      mime: "image/png",
      extension: "png",
      width: 320,
      height: 180
    });

    const gif = Buffer.alloc(10);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(40, 6);
    gif.writeUInt16LE(30, 8);
    expect(inspectImageArtifact(gif)).toMatchObject({
      mime: "image/gif",
      width: 40,
      height: 30
    });
  });

  it("rejects active or oversized image payloads", () => {
    expect(() => inspectImageArtifact(
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")
    )).toThrow(/PNG, JPEG, WebP, and GIF/);
    expect(() => inspectImageArtifact(png(8193, 1))).toThrow(/dimensions/);
    expect(() => inspectImageArtifact(png(8192, 8192))).toThrow(/pixel count/);
  });
});
