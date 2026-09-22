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
      server: { port: 7688, exposure: { mode: "local" } },
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
        port: 7688,
        exposure: { mode: "lan" }
      },
      auth: { enabled: false }
    });

    await expect(
      preflightRuntime(config, { serverProbe })
    ).rejects.toThrow("Refusing lan exposure without authentication");
    expect(serverProbe).not.toHaveBeenCalled();
  });

  it("probes the endpoint derived from the exposure profile", async () => {
    vi.stubEnv("PALMTTY_TEST_ACCESS_TOKEN", "0123456789abcdef");
    const serverProbe = vi.fn(async () => undefined);
    const config = parseConfig({
      server: { port: 17688, exposure: { mode: "lan" } },
      auth: {
        enabled: true,
        tokenEnv: "PALMTTY_TEST_ACCESS_TOKEN"
      }
    });

    await preflightRuntime(config, { serverProbe });
    expect(serverProbe).toHaveBeenCalledWith({
      host: "0.0.0.0",
      port: 17688
    });
  });

  it("aggregates a server bind failure with auth errors", async () => {
    vi.stubEnv("PALMTTY_TEST_ACCESS_TOKEN", "short");

    const config = parseConfig({
      server: { port: 7688, exposure: { mode: "local" } },
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

  it("checks direct HTTPS credentials before startup", async () => {
    vi.stubEnv("PALMTTY_TEST_ACCESS_TOKEN", "0123456789abcdef");
    const tlsProbe = vi.fn(async () => {
      throw new Error("bad certificate");
    });
    const config = parseConfig({
      server: {
        port: 7688,
        exposure: {
          mode: "https",
          origins: ["https://tty.example.com"],
          certificatePath: "cert.pem",
          privateKeyPath: "key.pem"
        }
      },
      auth: {
        enabled: true,
        tokenEnv: "PALMTTY_TEST_ACCESS_TOKEN"
      }
    });

    await expect(
      preflightRuntime(config, {
        serverProbe: async () => undefined,
        tlsProbe
      })
    ).rejects.toThrow("Direct HTTPS credentials are invalid");
    expect(tlsProbe).toHaveBeenCalled();
  });

  it("passes with local exposure even when auth is disabled", async () => {
    const config = parseConfig({
      server: { port: 7688, exposure: { mode: "local" } },
      auth: { enabled: false }
    });

    await expect(
      preflightRuntime(config, { serverProbe: async () => undefined })
    ).resolves.toBeUndefined();
  });
});
