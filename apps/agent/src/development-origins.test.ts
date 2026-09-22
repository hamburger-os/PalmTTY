import { describe, expect, it } from "vitest";
import { parseDevelopmentTrustedOrigins } from "./development-origins.js";
import { isTrustedOrigin } from "./security.js";

describe("development trusted origins", () => {
  it("parses and deduplicates exact HTTP origins", () => {
    expect(parseDevelopmentTrustedOrigins(JSON.stringify([
      "http://127.0.0.1:5173",
      "http://192.168.31.3:5173",
      "http://192.168.31.3:5173"
    ]))).toEqual([
      "http://127.0.0.1:5173",
      "http://192.168.31.3:5173"
    ]);
  });

  it("rejects paths and non-HTTP schemes", () => {
    expect(() => parseDevelopmentTrustedOrigins(JSON.stringify([
      "http://192.168.31.3:5173/path"
    ]))).toThrow("exact origin");

    expect(() => parseDevelopmentTrustedOrigins(JSON.stringify([
      "file:///tmp/palmtty"
    ]))).toThrow("http or https");
  });

  it("adds only explicit runtime development origins", () => {
    const generated = parseDevelopmentTrustedOrigins(JSON.stringify([
      "http://127.0.0.1:5173",
      "http://192.168.31.3:5173"
    ]));
    expect(isTrustedOrigin("http://192.168.31.3:5173", generated)).toBe(true);
    expect(isTrustedOrigin("http://192.168.31.4:5173", generated)).toBe(false);
  });
});
