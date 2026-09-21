import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configPathFromEnvironment, localAgentUrl, parseConfig } from "./index.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration", () => {
  it("uses PALMTTY_CONFIG as the shared explicit config path", () => {
    vi.stubEnv("PALMTTY_CONFIG", "./palmtty.test.yaml");
    expect(configPathFromEnvironment()).toBe(
      path.resolve("./palmtty.test.yaml")
    );
  });

  it("derives a local client URL for wildcard server binds", () => {
    const ipv4 = parseConfig({
      server: { host: "0.0.0.0", port: 8123 }
    });
    const ipv6 = parseConfig({
      server: { host: "::", port: 8124 }
    });

    expect(localAgentUrl(ipv4)).toBe("http://127.0.0.1:8123");
    expect(localAgentUrl(ipv6)).toBe("http://[::1]:8124");
  });

  it("applies safe local defaults without requiring a workspace", () => {
    const config = parseConfig({});
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.maxLoginSessions).toBe(32);
    expect(config.sessions.maxSessions).toBe(8);
    expect(config.sessions.exitedRetentionMinutes).toBe(30);
  });

  it("rejects legacy workspace configuration instead of silently ignoring it", () => {
    expect(() => parseConfig({
      workspaces: [{ id: "legacy", name: "Legacy", cwd: "C:\\Code" }]
    })).toThrow();
  });
});
