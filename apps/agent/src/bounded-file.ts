import type { FileHandle } from "node:fs/promises";

export async function readOpenedFileStableBounded(
  handle: FileHandle,
  expectedSize: number,
  maxBytes: number,
  label: string
): Promise<Buffer> {
  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize < 0 ||
    expectedSize > maxBytes
  ) {
    throw new Error(`${label} exceeds the configured size limit`);
  }

  const buffer = Buffer.alloc(expectedSize + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      offset
    );
    if (bytesRead === 0) break;
    offset += bytesRead;
  }

  if (offset !== expectedSize) {
    throw new Error(`${label} changed while it was being read`);
  }
  return buffer.subarray(0, offset);
}
