import net, { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeServerBindError,
  probeServerEndpoint
} from "./server-endpoint.js";

const servers = new Set<net.Server>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(() => resolve());
        })
    )
  );
  servers.clear();
});

async function listeningServer(): Promise<{ server: net.Server; port: number }> {
  const server = net.createServer();
  servers.add(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address() as AddressInfo;
  return { server, port: address.port };
}

describe("server endpoint preflight", () => {
  it("accepts an available endpoint", async () => {
    await probeServerEndpoint({ host: "127.0.0.1", port: 0 });
  });

  it("reports an occupied endpoint clearly", async () => {
    const { port } = await listeningServer();

    await expect(
      probeServerEndpoint({ host: "127.0.0.1", port })
    ).rejects.toThrow("is already in use");
  });

  it("gives actionable Windows EACCES diagnostics", () => {
    const error = Object.assign(new Error("permission denied"), {
      code: "EACCES"
    });

    const message = describeServerBindError(
      { host: "127.0.0.1", port: 7688 },
      error,
      "win32"
    );

    expect(message).toContain("EACCES/WSAEACCES");
    expect(message).toContain("Get-NetTCPConnection -LocalPort 7688");
    expect(message).toContain(
      "netsh interface ipv4 show excludedportrange protocol=tcp"
    );
  });
});
