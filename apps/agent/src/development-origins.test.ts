import { describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import {
  parseDevelopmentTrustedOrigins,
  withDevelopmentTrustedOrigins
} from "./development-origins.js";

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

  it("merges generated LAN origins without weakening configured origins", () => {
    const config = parseConfig({
      server: {
        host: "127.0.0.1",
        port: 17688,
        trustedOrigins: ["http://127.0.0.1:5173"]
      }
    });

    const merged = withDevelopmentTrustedOrigins(
      config,
      JSON.stringify([
        "http://127.0.0.1:5173",
        "http://192.168.31.3:5173"
      ])
    );

    expect(merged.server.host).toBe("127.0.0.1");
    expect(merged.server.trustedOrigins).toEqual([
      "http://127.0.0.1:5173",
      "http://192.168.31.3:5173"
    ]);
  });
});
