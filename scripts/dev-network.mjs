import {
  isPrivateIpv4,
  privateIpv4Addresses
} from "../packages/config/dist/index.js";

export const WEB_PORT = 5173;
export const DEFAULT_WEB_HOST = "0.0.0.0";

export const isPrivateDevelopmentIpv4 = isPrivateIpv4;
export const privateLanIpv4Addresses = privateIpv4Addresses;

export function developmentWebOrigin(host, port = WEB_PORT) {
  const formatted = host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;
  return `http://${formatted}:${port}`;
}

export function developmentWebOrigins(
  host,
  networkInterfaces,
  port = WEB_PORT
) {
  const origins = new Set([
    developmentWebOrigin("127.0.0.1", port),
    developmentWebOrigin("localhost", port)
  ]);

  if (host === "0.0.0.0" || host === "::") {
    for (const address of privateLanIpv4Addresses(networkInterfaces)) {
      origins.add(developmentWebOrigin(address, port));
    }
  } else {
    origins.add(developmentWebOrigin(host, port));
  }

  return [...origins];
}
