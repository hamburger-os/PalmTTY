import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { parseConfig } from "@palmtty/config";
import { MemoryWorkspaceStore } from "./workspace-store.js";

const owned = vi.hoisted(() => ({ start: vi.fn(), close: vi.fn(), gatewayClose: vi.fn() }));
vi.mock("./private-gateway.js", () => ({ PrivateGateway: class {
  async start() { throw new Error("private_gateway_port_in_use:443"); }
  async close() { owned.gatewayClose(); }
} }));
vi.mock("./managed-web-apps.js", () => ({ ManagedWebApps: class {
  start = owned.start;
  close = owned.close;
} }));
import { buildApp } from "./app.js";

it("closes the Agent with failure status when listener gateway bootstrap fails", async () => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-gateway-lifecycle-"));
  const previousExitCode = process.exitCode;
  const app = await buildApp(parseConfig({ auth: { enabled: false } }), {
    workspaceStore: new MemoryWorkspaceStore(), sessionManager: { runtimeDir }
  });
  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    await vi.waitFor(() => expect(app.server.listening).toBe(false));
    expect(process.exitCode).toBe(1);
    expect(owned.start).not.toHaveBeenCalled();
    expect(owned.close).toHaveBeenCalled();
    expect(owned.gatewayClose).toHaveBeenCalled();
  } finally {
    await app.close(); process.exitCode = previousExitCode;
    await rm(runtimeDir, { recursive: true, force: true });
  }
});
