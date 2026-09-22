import { describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { loadServerTlsOptions } from "./server-tls.js";

describe("server TLS", () => {
  it("does not load TLS material for non-HTTPS exposure", async () => {
    const config = parseConfig({
      server: {
        port: 17688,
        exposure: { mode: "local" }
      }
    });
    await expect(loadServerTlsOptions(config)).resolves.toBeUndefined();
  });

  it("fails closed when direct HTTPS credentials are unavailable", async () => {
    const config = parseConfig({
      server: {
        port: 17688,
        exposure: {
          mode: "https",
          origins: ["https://tty.example.com:17688"],
          certificatePath: "/definitely/missing/palmtty-cert.pem",
          privateKeyPath: "/definitely/missing/palmtty-key.pem"
        }
      }
    });
    await expect(loadServerTlsOptions(config)).rejects.toThrow();
  });
});
