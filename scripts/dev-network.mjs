export const WEB_PORT = 5173;
export const DEFAULT_WEB_HOST = "0.0.0.0";

export function isPrivateDevelopmentIpv4(address) {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function privateLanIpv4Addresses(networkInterfaces) {
  const addresses = new Set();
  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      const ipv4 = entry.family === "IPv4" || entry.family === 4;
      if (
        !ipv4 ||
        entry.internal ||
        !isPrivateDevelopmentIpv4(entry.address)
      ) {
        continue;
      }
      addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}

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
