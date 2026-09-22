import { describe, expect, it } from "vitest";
import { exposureOrigins, parseConfig } from "@palmtty/config";
import { FixedWindowLimiter, assertSecureExposure, isTrustedOrigin } from "./security.js";

function config(overrides: object = {}) {
  return parseConfig({
    ...overrides
  });
}

describe("security boundary", () => {
  it("allows local exposure with exact local origins", () => {
    const value = config();
    const origins = exposureOrigins(value);
    expect(isTrustedOrigin("http://127.0.0.1:7688", origins)).toBe(true);
    expect(isTrustedOrigin("http://127.0.0.1:7689", origins)).toBe(false);
    expect(() => assertSecureExposure(value)).not.toThrow();
  });

  it("requires authentication for LAN exposure", () => {
    const value = config({
      server: { exposure: { mode: "lan" } },
      auth: { enabled: false }
    });
    expect(() => assertSecureExposure(value)).toThrow("without authentication");
  });

  it("accepts authenticated LAN mode as an explicit insecure-private profile", () => {
    const value = config({
      server: { exposure: { mode: "lan" } },
      auth: { enabled: true }
    });
    expect(() => assertSecureExposure(value)).not.toThrow();
  });

  it("uses exact origin matching", () => {
    const value = config({
      server: {
        exposure: {
          mode: "reverseProxy",
          origins: ["https://dev.example.com"]
        }
      }
    });
    const origins = exposureOrigins(value);
    expect(isTrustedOrigin("https://dev.example.com", origins)).toBe(true);
    expect(isTrustedOrigin("https://dev.example.com.evil.invalid", origins)).toBe(false);
  });

  it("bounds rate-limiter bucket state while preserving limits", () => {
    const limiter = new FixedWindowLimiter(2, 1_000, 2);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("c", 0)).toBe(true);
    expect(limiter.allow("c", 1)).toBe(true);
    expect(limiter.allow("c", 2)).toBe(false);
    expect(limiter.allow("a", 2)).toBe(true);
  });
});
