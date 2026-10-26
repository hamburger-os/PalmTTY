import { expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { AUTH_COOKIE } from "./auth.js";
import { PrivateGateway, privateGatewayFiles, privateGatewayPorts } from "./private-gateway.js";
const server={port:17688,exposure:{mode:"lan"},privateGateway:{listenHost:"192.168.1.3"}};
it("derives IP proxy routes without DNS and strips the PalmTTY cookie",()=>{
  const config=parseConfig({server,integrations:{vscodeWeb:{mode:"managed"},harness:{mode:"managed"}}});
  const files=privateGatewayFiles(config,"C:/private-network");
  expect(files).not.toHaveProperty("dns");
  expect(files.caddy).toContain("https://192.168.1.3");
  expect(files.caddy).toContain("http://192.168.1.3:3080");
  expect(files.caddy.match(/tls internal/gu)).toHaveLength(1);
  expect(files.caddy).toContain("reverse_proxy 127.0.0.1:8000");
  expect(files.caddy).toContain("reverse_proxy 127.0.0.1:3080");
  expect(files.caddy).toContain(AUTH_COOKIE+"=[^;]*");
  expect(files.caddy).toContain("skip_install_trust");
  expect(files.caddy).toContain("@outside not remote_ip private_ranges");
  expect(privateGatewayPorts(config)).toEqual([443,3080]);
  expect(files.caddy).not.toContain("17688");
});
it("does not require TLS or Code when only Harness is enabled",()=>{
  const config=parseConfig({server,integrations:{harness:{mode:"managed"}}});
  expect(privateGatewayPorts(config)).toEqual([3080]);
  expect(privateGatewayFiles(config,"C:/private-network").caddy).not.toContain("tls internal");
});
it("never starts services after its lifetime has closed",async()=>{
  const gateway=new PrivateGateway(parseConfig({server,integrations:{harness:{mode:"managed"}}}));
  await gateway.close();await expect(gateway.start()).resolves.toBeUndefined();
});
