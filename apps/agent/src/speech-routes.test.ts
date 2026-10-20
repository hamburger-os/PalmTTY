import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { registerSpeechRoutes } from "./speech-routes.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const origin = "http://127.0.0.1:7688";
const upstreamServers: Server[] = [];
afterEach(async () => {
  delete process.env.PALMTTY_QWEN_TOKEN;
  await Promise.all(upstreamServers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

async function createRoutes(enabled: boolean, port: number) {
  const app = Fastify();
  registerSpeechRoutes(app, {
    config: parseConfig({ speech: { qwen: { enabled, port } } }),
    requireOrigin: async (request, reply) => {
      if (request.headers.origin !== origin) await reply.code(403).send({ error: "untrusted_origin" });
    },
    requireAuth: async (request, reply) => {
      if (request.headers.cookie !== "session=test") {
        await reply.code(401).send({ error: "authentication_required" });
      }
    }
  });
  return app;
}

async function fakeModel() {
  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401).end();
      return;
    }
    if (request.url === "/status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ model: "1.7b" }));
      return;
    }
    if (request.url === "/synthesize") {
      const wav = Buffer.alloc(44);
      wav.write("RIFF", 0, "ascii");
      wav.write("WAVE", 8, "ascii");
      response.writeHead(200, { "content-type": "audio/wav" });
      response.end(wav);
      return;
    }
    response.writeHead(404).end();
  });
  upstreamServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

describe("private Qwen speech boundary", () => {
  it("is opt-in and does not expose a synthesis endpoint when disabled", async () => {
    const app = await createRoutes(false, 18765);
    expect((await app.inject({ method: "GET", url: "/api/v1/speech/qwen/status",
      headers: { cookie: "session=test" } })).json()).toMatchObject({ enabled: false, ready: false });
    expect((await app.inject({ method: "POST", url: "/api/v1/speech/qwen/synthesize",
      headers: { cookie: "session=test", origin }, payload: { text: "你好", speaker: "Vivian" }
    })).statusCode).toBe(404);
    await app.close();
  });

  it("requires session authentication, exact Origin, local token, and bounded requests", async () => {
    const app = await createRoutes(true, 18765);
    const payload = { text: "你好", speaker: "Vivian", style: "neutral" };
    expect((await app.inject({ method: "POST", url: "/api/v1/speech/qwen/synthesize",
      headers: { origin }, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/speech/qwen/synthesize",
      headers: { cookie: "session=test", origin: "https://evil.test" }, payload })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/speech/qwen/synthesize",
      headers: { cookie: "session=test", origin }, payload })).statusCode).toBe(503);
    process.env.PALMTTY_QWEN_TOKEN = TOKEN;
    expect((await app.inject({ method: "POST", url: "/api/v1/speech/qwen/synthesize",
      headers: { cookie: "session=test", origin }, payload: { ...payload, text: "x".repeat(261) } })).statusCode).toBe(400);
    await app.close();
  });

  it("proxies bounded WAV only and does not reveal the private Qwen token", async () => {
    process.env.PALMTTY_QWEN_TOKEN = TOKEN;
    const port = await fakeModel();
    const app = await createRoutes(true, port);
    const status = await app.inject({ method: "GET", url: "/api/v1/speech/qwen/status",
      headers: { cookie: "session=test" } });
    expect(status.json()).toMatchObject({ enabled: true, ready: true, model: "1.7b" });
    expect(status.body).not.toContain(TOKEN);
    const audio = await app.inject({
      method: "POST", url: "/api/v1/speech/qwen/synthesize",
      headers: { cookie: "session=test", origin },
      payload: { text: "你好", speaker: "Vivian", style: "story" }
    });
    expect(audio.statusCode).toBe(200);
    expect(audio.headers["cache-control"]).toBe("private, no-store");
    expect(audio.headers["content-type"]).toBe("audio/wav");
    await app.close();
  });
});
