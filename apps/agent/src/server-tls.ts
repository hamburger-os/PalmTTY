import { readFile } from "node:fs/promises";
import { createSecureContext } from "node:tls";
import type { PalmTTYConfig } from "@palmtty/config";

export type ServerTlsOptions = {
  cert: Buffer;
  key: Buffer;
};

export async function loadServerTlsOptions(
  config: Pick<PalmTTYConfig, "server">
): Promise<ServerTlsOptions | undefined> {
  const exposure = config.server.exposure;
  if (exposure.mode !== "https") return undefined;

  const [cert, key] = await Promise.all([
    readFile(exposure.certificatePath),
    readFile(exposure.privateKeyPath)
  ]);
  createSecureContext({ cert, key });
  return { cert, key };
}
