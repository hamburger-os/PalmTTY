import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "@palmtty/config";
import { preflightRuntime } from "./preflight.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runtime preflight", () => {
  it("reports authentication and workspace failures together", async () => {
    vi.stubEnv("PALMTTY_TEST_ACCESS_TOKEN", "short");

    const config = parseConfig({
      server: { host: "127.0.0.1", port: 7688 },
      auth: {
        enabled: true,
        tokenEnv: "PALMTTY_TEST_ACCESS_TOKEN"
      },
      workspaces: [
        {
          id: "missing",
          name: "Missing workspace",
          cwd: path.join(os.tmpdir(), "palmtty-preflight-definitely-missing"),
          shell: "custom",
          shellPath: process.execPath
        }
      ]
    });

    let failure: unknown;
    try {
      await preflightRuntime(config, { serverProbe: async () => undefined });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain("Runtime preflight failed:");
    expect(message).toContain("PALMTTY_TEST_ACCESS_TOKEN");
    expect(message).toContain('Workspace "missing" directory is unavailable');
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
      auth: { enabled: false },
      workspaces: [
        {
          id: "node",
          name: "Node",
          cwd: process.cwd(),
          shell: "custom",
          shellPath: process.execPath,
          args: []
        }
      ]
    });

    await expect(
      preflightRuntime(config, { serverProbe })
    ).rejects.toThrow("Refusing non-loopback bind without authentication");
    expect(serverProbe).not.toHaveBeenCalled();
  });

  it("aggregates a server bind failure with other host errors", async () => {
    vi.stubEnv("PALMTTY_TEST_ACCESS_TOKEN", "short");

    const config = parseConfig({
      server: { host: "127.0.0.1", port: 7688 },
      auth: {
        enabled: true,
        tokenEnv: "PALMTTY_TEST_ACCESS_TOKEN"
      },
      workspaces: [
        {
          id: "node",
          name: "Node",
          cwd: process.cwd(),
          shell: "custom",
          shellPath: process.execPath,
          args: []
        }
      ]
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

  it("returns normalized workspaces when the host is launchable", async () => {
    const config = parseConfig({
      server: { host: "127.0.0.1", port: 7688 },
      auth: { enabled: false },
      workspaces: [
        {
          id: "node",
          name: "Node",
          cwd: process.cwd(),
          shell: "custom",
          shellPath: process.execPath,
          args: []
        }
      ]
    });

    const result = await preflightRuntime(config, { serverProbe: async () => undefined });
    const workspace = result.workspaces.get("node");
    expect(workspace?.id).toBe("node");
    expect(workspace?.executable).toBeTypeOf("string");
    expect(path.isAbsolute(workspace?.executable ?? "")).toBe(true);
  });
});
