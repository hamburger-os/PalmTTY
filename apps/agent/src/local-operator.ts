import { networkInterfaces } from "node:os";
import { isIP } from "node:net";

/** Direct host-local operator traffic only, never a forwarded browser request. */
export function isLocalOperator(source: string, host: string, port: number, forwarded: boolean): boolean {
  if (forwarded) return false;
  const normalize = (value: string) => value.replace(/^::ffff:/u, "").replace(/^\[|\]$/gu, "");
  const addresses = new Set(["127.0.0.1", "::1", ...Object.values(networkInterfaces()).flatMap((entries) => (entries ?? []).map((entry) => normalize(entry.address)))]);
  try {
    const url = new URL("http://" + host);
    const hostname = normalize(url.hostname);
    return isIP(hostname) !== 0 && Number(url.port || 80) === port &&
      addresses.has(hostname) && addresses.has(normalize(source));
  } catch { return false; }
}
