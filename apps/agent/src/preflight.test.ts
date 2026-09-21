import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "@palmtty/config";
import { preflightRuntime } from "./preflight.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime preflight", () => {
  it("reports authentication failures", async () => {
    vi.stubEnv("PALMTTY_TEST_ACCESS_TOKEN", "short");

    const config = parseConfig({
      server: { host: "127.0.0.1", port: 7688 },
      auth: {
        enabled: true,
        tokenEnv: "PALMTTY_TEST_ACCESS_TOKEN"
      }
    });

    await expect(
      preflightRuntime(config, { serverProbe: async () => undefined })
    ).rejects.toThrow("PALMTTY_TEST_ACCESS_TOKEN");
  });

  it("does not bind an endpoint rejected by the exposure gate", async () => {
    const serverProbe = vi.fn(async () => undefined);
    const config = parseConfig({
      server: {
        host: "0.0.0.0",
        port: 7688,
        secureCookies: false,
        unsafeAllowInsecureLan: false
      },
      auth: { enabled: false }
    });

    await expect(
      preflightRuntime(config, { serverProbe })
    ).rejects.toThrow("Refusing non-loopback bind without authentication");
    expect(serverProbe).not.toHaveBeenCalled();
  });

  it("aggregates a server bind failure with auth errors", async () => {
    vi.stubEnv("PALMTTY_TEST_ACCESS_TOKEN", "short");

    const config = parseConfig({
      server: { host: "127.0.0.1", port: 7688 },
      auth: {
        enabled: true,
        tokenEnv: "PALMTTY_TEST_ACCESS_TOKEN"
      }
    });

    await expect(
      preflightRuntime(config, {
        serverProbe: async () => {
          throw new Error("Server endpoint 127.0.0.1:7688 is not bindable");
        }
      })
    ).rejects.toThrow(
      /PALMTTY_TEST_ACCESS_TOKEN[\s\S]*Server endpoint 127\.0\.0\.1:7688 is not bindable/
    );
  });

  it("passes with safe host configuration even when no workspace exists", async () => {
    const config = parseConfig({
      server: { host: "127.0.0.1", port: 7688 },
      auth: { enabled: false }
    });

    await expect(
      preflightRuntime(config, { serverProbe: async () => undefined })
    ).resolves.toBeUndefined();
  });
});
