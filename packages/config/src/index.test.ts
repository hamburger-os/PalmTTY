import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configPathFromEnvironment,
  exposureOrigins,
  isPrivateIpv4,
  lanAgentUrls,
  localAgentUrl,
  parseConfig,
  privateIpv4Addresses,
  secureCookies,
  serverBindHost,
  serverScheme
} from "./index.js";

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

  it("applies local exposure defaults", () => {
    const config = parseConfig({});
    expect(config.server.port).toBe(7688);
    expect(config.server.exposure).toEqual({ mode: "local" });
    expect(serverBindHost(config)).toBe("127.0.0.1");
    expect(serverScheme(config)).toBe("http");
    expect(secureCookies(config)).toBe(false);
    expect(localAgentUrl(config)).toBe("http://127.0.0.1:7688");
    expect(config.auth.enabled).toBe(true);
    expect(config.auth.maxLoginSessions).toBe(32);
    expect(config.sessions.maxSessions).toBe(8);
    expect(config.sessions.exitedRetentionMinutes).toBe(30);
  });

  it("derives LAN listeners and exact private origins", () => {
    const config = parseConfig({
      server: {
        port: 17688,
        exposure: { mode: "lan" }
      }
    });
    const interfaces = {
      Ethernet: [{
        address: "192.168.31.3",
        family: "IPv4",
        internal: false,
        netmask: "255.255.255.0",
        cidr: "192.168.31.3/24",
        mac: "00:00:00:00:00:01",
        scopeid: 0
      }],
      Tailscale: [{
        address: "100.90.80.70",
        family: "IPv4",
        internal: false,
        netmask: "255.192.0.0",
        cidr: "100.90.80.70/10",
        mac: "00:00:00:00:00:02",
        scopeid: 0
      }],
      Public: [{
        address: "203.0.113.9",
        family: "IPv4",
        internal: false,
        netmask: "255.255.255.0",
        cidr: "203.0.113.9/24",
        mac: "00:00:00:00:00:03",
        scopeid: 0
      }]
    } satisfies ReturnType<typeof os.networkInterfaces>;

    expect(serverBindHost(config)).toBe("0.0.0.0");
    expect(localAgentUrl(config)).toBe("http://127.0.0.1:17688");
    expect(exposureOrigins(config, interfaces)).toEqual([
      "http://127.0.0.1:17688",
      "http://localhost:17688",
      "http://100.90.80.70:17688",
      "http://192.168.31.3:17688"
    ]);
    expect(lanAgentUrls(config, interfaces)).toEqual([
      "http://100.90.80.70:17688",
      "http://192.168.31.3:17688"
    ]);
  });

  it("classifies only private/overlay IPv4 addresses", () => {
    for (const address of [
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.31.3",
      "169.254.10.20",
      "100.64.0.1",
      "100.127.255.254"
    ]) {
      expect(isPrivateIpv4(address)).toBe(true);
    }
    for (const address of [
      "8.8.8.8",
      "172.15.255.255",
      "172.32.0.1",
      "100.63.255.255",
      "100.128.0.1",
      "::1",
      "not-an-ip"
    ]) {
      expect(isPrivateIpv4(address)).toBe(false);
    }
  });

  it("deduplicates private interface addresses", () => {
    const interfaces = {
      Ethernet: [{
        address: "192.168.31.3",
        family: "IPv4",
        internal: false,
        netmask: "255.255.255.0",
        cidr: "192.168.31.3/24",
        mac: "00:00:00:00:00:01",
        scopeid: 0
      }, {
        address: "192.168.31.3",
        family: "IPv4",
        internal: false,
        netmask: "255.255.255.0",
        cidr: "192.168.31.3/24",
        mac: "00:00:00:00:00:02",
        scopeid: 0
      }]
    } satisfies ReturnType<typeof os.networkInterfaces>;
    expect(privateIpv4Addresses(interfaces)).toEqual(["192.168.31.3"]);
  });

  it("requires exact HTTPS origins for HTTPS and reverse-proxy exposure", () => {
    const reverseProxy = parseConfig({
      server: {
        port: 17688,
        exposure: {
          mode: "reverseProxy",
          origins: ["https://tty.example.com"]
        }
      }
    });
    expect(serverBindHost(reverseProxy)).toBe("127.0.0.1");
    expect(serverScheme(reverseProxy)).toBe("http");
    expect(secureCookies(reverseProxy)).toBe(true);
    expect(exposureOrigins(reverseProxy)).toEqual(["https://tty.example.com"]);

    const directHttps = parseConfig({
      server: {
        port: 17688,
        exposure: {
          mode: "https",
          origins: ["https://192.168.31.3:17688"],
          certificatePath: "./cert.pem",
          privateKeyPath: "./key.pem"
        }
      }
    });
    expect(serverBindHost(directHttps)).toBe("0.0.0.0");
    expect(serverScheme(directHttps)).toBe("https");
    expect(secureCookies(directHttps)).toBe(true);

    expect(() => parseConfig({
      server: {
        exposure: {
          mode: "reverseProxy",
          origins: ["http://tty.example.com"]
        }
      }
    })).toThrow();
    expect(() => parseConfig({
      server: {
        exposure: {
          mode: "https",
          origins: ["https://tty.example.com/path"],
          certificatePath: "cert.pem",
          privateKeyPath: "key.pem"
        }
      }
    })).toThrow();
  });

  it("rejects the removed low-level exposure switches", () => {
    expect(() => parseConfig({
      server: {
        host: "0.0.0.0",
        port: 7688,
        trustedOrigins: ["http://127.0.0.1:7688"],
        secureCookies: false,
        unsafeAllowInsecureLan: true
      }
    })).toThrow();
  });

  it("rejects legacy workspace configuration instead of silently ignoring it", () => {
    expect(() => parseConfig({
      workspaces: [{ id: "legacy", name: "Legacy", cwd: "C:\\Code" }]
    })).toThrow();
  });
});
