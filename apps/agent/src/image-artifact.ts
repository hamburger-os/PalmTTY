import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  type SessionArtifactMime
} from "@palmtty/protocol";

export type ImageArtifactInfo = {
  mime: SessionArtifactMime;
  extension: "png" | "jpg" | "webp" | "gif";
  width: number;
  height: number;
};

function checked(
  mime: SessionArtifactMime,
  extension: ImageArtifactInfo["extension"],
  width: number,
  height: number
): ImageArtifactInfo {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION
  ) {
    throw new Error(
      `Image dimensions must be between 1 and ${MAX_IMAGE_DIMENSION} pixels`
    );
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      `Image pixel count must not exceed ${MAX_IMAGE_PIXELS}`
    );
  }
  return { mime, extension, width, height };
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ])) &&
    buffer.toString("ascii", 12, 16) === "IHDR";
}

function inspectJpeg(buffer: Buffer): ImageArtifactInfo | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return undefined;
  }

  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf
  ]);
  let offset = 2;

  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset]!;
    offset += 1;

    if (
      marker === 0x01 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }

    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) {
      throw new Error("JPEG image is truncated");
    }

    if (sofMarkers.has(marker)) {
      if (length < 7) throw new Error("JPEG frame header is invalid");
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return checked("image/jpeg", "jpg", width, height);
    }
    offset += length;
  }

  throw new Error("JPEG image does not contain a supported frame header");
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return (
    buffer[offset]! |
    (buffer[offset + 1]! << 8) |
    (buffer[offset + 2]! << 16)
  );
}

function inspectWebp(buffer: Buffer): ImageArtifactInfo | undefined {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return undefined;
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return checked(
      "image/webp",
      "webp",
      readUInt24LE(buffer, 24) + 1,
      readUInt24LE(buffer, 27) + 1
    );
  }

  if (chunk === "VP8L") {
    if (buffer.length < 25 || buffer[20] !== 0x2f) {
      throw new Error("WebP lossless header is invalid");
    }
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return checked("image/webp", "webp", width, height);
  }

  if (chunk === "VP8 ") {
    if (
      buffer.length < 30 ||
      buffer[23] !== 0x9d ||
      buffer[24] !== 0x01 ||
      buffer[25] !== 0x2a
    ) {
      throw new Error("WebP lossy frame header is invalid");
    }
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return checked("image/webp", "webp", width, height);
  }

  throw new Error("Unsupported WebP image encoding");
}

export function inspectImageArtifact(buffer: Buffer): ImageArtifactInfo {
  if (isPng(buffer)) {
    return checked(
      "image/png",
      "png",
      buffer.readUInt32BE(16),
      buffer.readUInt32BE(20)
    );
  }

  if (
    buffer.length >= 10 &&
    (buffer.toString("ascii", 0, 6) === "GIF87a" ||
      buffer.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return checked(
      "image/gif",
      "gif",
      buffer.readUInt16LE(6),
      buffer.readUInt16LE(8)
    );
  }

  const jpeg = inspectJpeg(buffer);
  if (jpeg) return jpeg;

  const webp = inspectWebp(buffer);
  if (webp) return webp;

  throw new Error("Only PNG, JPEG, WebP, and GIF images are supported");
}
