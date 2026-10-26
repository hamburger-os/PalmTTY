import { expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { PrivateGateway, privateGatewayFiles } from "./private-gateway.js";
it("derives separate TLS routes and bounded private DNS from the single host configuration", () => {
  const config = parseConfig({server:{port:17688,exposure:{mode:"reverseProxy",listenHost:"127.0.0.1",origins:["https://palm.palmtty.home.arpa"]},privateGateway:{listenHost:"192.168.1.3",upstreamDns:"192.168.1.1"}},integrations:{vscodeWeb:{mode:"managed",url:"https://code.palmtty.home.arpa"},harness:{mode:"managed",url:"https://harness.palmtty.home.arpa"}}});
  const {caddy,dns} = privateGatewayFiles(config,"C:/private-network");
  expect(caddy.match(/tls internal/gu)).toHaveLength(3);
  for (const port of [17688,8000,3080]) expect(caddy).toContain(`reverse_proxy 127.0.0.1:${port}`);
  expect(caddy).toContain("skip_install_trust"); expect(caddy).toContain("admin off");
  expect(caddy).not.toContain("log { ");
  expect(dns).toContain("block"); expect(dns).toContain("max_concurrent 64");
  expect(dns).toContain("192.168.1.3 palm.palmtty.home.arpa code.palmtty.home.arpa harness.palmtty.home.arpa");
  expect(dns).not.toContain("log");
});

it("never starts services after its lifetime has closed", async () => {
  const config = parseConfig({server:{exposure:{mode:"reverseProxy",listenHost:"127.0.0.1",origins:["https://palm.palmtty.home.arpa"]},privateGateway:{listenHost:"192.168.1.3",upstreamDns:"192.168.1.1"}},integrations:{vscodeWeb:{mode:"managed",url:"https://code.palmtty.home.arpa"},harness:{mode:"managed",url:"https://harness.palmtty.home.arpa"}}});
  const gateway = new PrivateGateway(config);
  await gateway.close();
  await expect(gateway.start()).resolves.toBeUndefined();
});
