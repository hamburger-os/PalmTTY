import assert from "node:assert/strict";
import test from "node:test";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseConfig } from "../packages/config/dist/index.js";
import { createLocalAgentClient } from "./local-agent-client.mjs";

test("local HTTPS tools validate the configured certificate identity while connecting over loopback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-client-tls-"));
  const certificatePath = path.join(root, "server.crt"), privateKeyPath = path.join(root, "server.key");
  let server;
  try {
    // Test-only key material is generated and removed, never committed or logged.
    const configuration = path.join(root, "request.cnf");
    await writeFile(configuration, "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=tty.example.test\n[ext]\nsubjectAltName=DNS:tty.example.test,IP:::1\nbasicConstraints=critical,CA:TRUE\n");
    const args = ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-config", configuration, "-keyout", privateKeyPath, "-out", certificatePath];
    let generated;
    for (const executable of ["openssl", path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin", "openssl.exe")]) {
      generated = spawnSync(executable, args, { windowsHide: true, stdio: "ignore", timeout: 30_000 });
      if (generated.error?.code !== "ENOENT") break;
    }
    assert.equal(generated?.status, 0, "OpenSSL is required for the isolated TLS regression fixture");
    server = https.createServer({ cert: await readFile(certificatePath), key: await readFile(privateKeyPath) }, (request, response) => {
      if (request.url === "/large") { response.end(Buffer.alloc(65537)); return; }
      response.writeHead(204, { "set-cookie": "fixture=value; HttpOnly; Secure" }); response.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const configFor = (hostname) => parseConfig({ server: { port, exposure: {
      mode: "https", listenHost: "0.0.0.0", origins: [`https://${hostname}:${port}`], certificatePath, privateKeyPath
    } } });
    const client = await createLocalAgentClient(configFor("tty.example.test"));
    const response = await client("/", { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 204);
    assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure/u);
    const ipv6Identity = await createLocalAgentClient(configFor("[::1]"));
    assert.equal((await ipv6Identity("/")).status, 204);
    const wrongIdentity = await createLocalAgentClient(configFor("wrong.example.test"));
    await assert.rejects(wrongIdentity("/"), /local_agent_tls_validation_failed/u);
    await assert.rejects(client("/large"), /local_agent_response_too_large/u);
  } finally {
    await new Promise((resolve) => server ? server.close(resolve) : resolve());
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});
