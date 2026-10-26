import https from "node:https";
import { checkServerIdentity } from "node:tls";
import { isIP } from "node:net";
import { readFile } from "node:fs/promises";

const MAX_RESPONSE_BYTES = 64 * 1024;
const TLS_ERRORS = new Set([
  "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "SELF_SIGNED_CERT_IN_CHAIN"
]);

/** Connect locally while verifying the configured HTTPS identity and trust material. */
export async function createLocalAgentClient(config) {
  const { exposureOrigins, localAgentUrl } = await import("../packages/config/dist/index.js");
  const base = localAgentUrl(config);
  if (config.server.exposure.mode !== "https") return (pathname, init) => fetch(base + pathname, init);
  const ca = await readFile(config.server.exposure.certificatePath);
  const servername = new URL(exposureOrigins(config)[0]).hostname.replace(/^\[|\]$/gu, "");
  return (pathname, init = {}) => new Promise((resolve, reject) => {
    const request = https.request(base + pathname, {
      method: init.method ?? "GET", headers: init.headers, signal: init.signal,
      ca, servername: isIP(servername) ? "" : servername,
      checkServerIdentity: (_host, certificate) => checkServerIdentity(servername, certificate),
      allowPartialTrustChain: true, rejectUnauthorized: true
    }, (response) => {
      const chunks = []; let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) { request.destroy(new Error("local_agent_response_too_large")); return; }
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => {
        const headers = new Headers();
        for (const [name, values] of Object.entries(response.headers)) {
          for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) headers.append(name, value);
        }
        const body = Buffer.concat(chunks);
        resolve(new Response(body.length ? body : null, { status: response.statusCode, headers }));
      });
    });
    request.once("error", (error) => reject(TLS_ERRORS.has(error.code)
      ? new Error("local_agent_tls_validation_failed: check the HTTPS Origin and configured certificate", { cause: error }) : error));
    request.end(init.body);
  });
}
