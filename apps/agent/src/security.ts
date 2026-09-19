import type { PalmTTYConfig } from "@palmtty/config";

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function normalizedOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isTrustedOrigin(origin: string | undefined, config: PalmTTYConfig): boolean {
  if (!origin) return false;
  const candidate = normalizedOrigin(origin);
  if (!candidate) return false;

  const configured = config.server.trustedOrigins
    .map(normalizedOrigin)
    .filter((value): value is string => Boolean(value));

  if (configured.includes(candidate)) return true;

  if (isLoopbackHost(config.server.host)) {
    try {
      const url = new URL(candidate);
      return isLoopbackHost(url.hostname) && Number(url.port || (url.protocol === "https:" ? 443 : 80)) === config.server.port;
    } catch {
      return false;
    }
  }

  return false;
}

export function assertSecureExposure(config: PalmTTYConfig): void {
  if (isLoopbackHost(config.server.host)) return;
  if (config.server.unsafeAllowInsecureLan) return;

  if (!config.auth.enabled) {
    throw new Error("Refusing non-loopback bind without authentication. Enable auth or explicitly set unsafeAllowInsecureLan.");
  }
  if (!config.server.secureCookies) {
    throw new Error("Refusing non-loopback bind with insecure auth cookies. Put PalmTTY behind HTTPS and set secureCookies: true.");
  }
  if (config.server.trustedOrigins.length === 0) {
    throw new Error("Refusing non-loopback bind without an explicit trustedOrigins allowlist.");
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
