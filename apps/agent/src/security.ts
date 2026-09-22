import type { PalmTTYConfig } from "@palmtty/config";

function normalizedOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isTrustedOrigin(
  origin: string | undefined,
  trustedOrigins: readonly string[]
): boolean {
  if (!origin) return false;
  const candidate = normalizedOrigin(origin);
  if (!candidate) return false;
  return trustedOrigins.some((value) => normalizedOrigin(value) === candidate);
}

export function assertSecureExposure(config: PalmTTYConfig): void {
  const mode = config.server.exposure.mode;
  if (mode === "local") return;

  if (!config.auth.enabled) {
    throw new Error(`Refusing ${mode} exposure without authentication.`);
  }

  if (mode === "reverseProxy" || mode === "https") {
    for (const origin of config.server.exposure.origins) {
      if (new URL(origin).protocol !== "https:") {
        throw new Error(`Refusing ${mode} exposure with non-HTTPS Origin: ${origin}`);
      }
    }
  }
}

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxBuckets = 1024
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const current = this.buckets.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.prune(now);
      if (!this.buckets.has(key) && this.buckets.size >= this.maxBuckets) {
        const oldestKey = this.buckets.keys().next().value as string | undefined;
        if (oldestKey) this.buckets.delete(oldestKey);
      }
      this.buckets.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(key);
    }
  }
}
