import { describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { assertSecureExposure, isTrustedOrigin } from "./security.js";

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
