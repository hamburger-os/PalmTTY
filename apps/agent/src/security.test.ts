import { describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { FixedWindowLimiter, assertSecureExposure, isTrustedOrigin } from "./security.js";

function config(overrides: object = {}) {
  return parseConfig({
    ...overrides,
    workspaces: [{ id: "main", name: "Main", cwd: "C:\\Code" }]
  });
}

describe("security boundary", () => {
  it("allows loopback with local origin", () => {
    const value = config();
    expect(isTrustedOrigin("http://127.0.0.1:7688", value)).toBe(true);
    expect(() => assertSecureExposure(value)).not.toThrow();
  });

  it("requires auth, secure cookies, and origins for non-loopback binds", () => {
    const value = config({
      server: { host: "0.0.0.0" },
      auth: { enabled: false }
    });
    expect(() => assertSecureExposure(value)).toThrow();
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

  it("uses exact origin matching", () => {
    const value = config({
      server: {
        host: "0.0.0.0",
        secureCookies: true,
        trustedOrigins: ["https://dev.example.com"]
      }
    });
    expect(isTrustedOrigin("https://dev.example.com", value)).toBe(true);
    expect(isTrustedOrigin("https://dev.example.com.evil.invalid", value)).toBe(false);
  });
});
