import net from "node:net";
import type { PalmTTYConfig } from "@palmtty/config";

export type ServerEndpoint = Pick<PalmTTYConfig["server"], "host" | "port">;

function endpointLabel(endpoint: ServerEndpoint): string {
  const host = endpoint.host.includes(":") && !endpoint.host.startsWith("[")
    ? `[${endpoint.host}]`
    : endpoint.host;
  return `${host}:${endpoint.port}`;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

export function describeServerBindError(
  endpoint: ServerEndpoint,
  error: unknown,
  platform: NodeJS.Platform = process.platform
): string {
  const label = endpointLabel(endpoint);
  const code = errorCode(error);

  if (code === "EADDRINUSE") {
    return (
      `Server endpoint ${label} is already in use. ` +
      "Stop the existing listener or choose a different server.port."
    );
  }

  if (code === "EADDRNOTAVAIL") {
    return (
      `Server host ${endpoint.host} is not available on this machine. ` +
      "Choose a local interface address or a loopback host."
    );
  }

  if (code === "EACCES" && platform === "win32") {
    return (
      `Windows denied binding TCP endpoint ${label} (EACCES/WSAEACCES). ` +
      "The port may be in a Windows excluded/reserved TCP range, held by an " +
      "exclusive listener, or blocked by local policy. Check " +
      `Get-NetTCPConnection -LocalPort ${endpoint.port} -ErrorAction SilentlyContinue ` +
      "and netsh interface ipv4 show excludedportrange protocol=tcp; " +
      "then choose a different server.port if necessary."
    );
  }

  if (code === "EACCES") {
    return (
      `Permission denied while binding server endpoint ${label}. ` +
      "Choose a permitted host/port or adjust the local policy."
    );
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `Server endpoint ${label} is not bindable: ${detail}`;
}

export async function probeServerEndpoint(
  endpoint: ServerEndpoint
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    const onError = (error: Error) => {
      reject(new Error(describeServerBindError(endpoint, error), { cause: error }));
    };

    server.once("error", onError);
    server.listen(
      {
        host: endpoint.host,
        port: endpoint.port
      },
      () => {
        server.removeListener("error", onError);
        server.close(() => resolve());
      }
    );
  });
}
