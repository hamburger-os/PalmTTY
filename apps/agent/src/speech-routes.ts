import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PalmTTYConfig } from "@palmtty/config";
import { z } from "zod";
import { FixedWindowLimiter } from "./security.js";

const speakers = ["Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden", "Ono_Anna", "Sohee"] as const;
const QwenRequest = z.object({
  text: z.string().min(1).max(260),
  speaker: z.enum(speakers),
  style: z.enum(["neutral", "story"]).default("neutral")
}).strict();
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const TOKEN_ENV = "PALMTTY_QWEN_TOKEN";

type Guard = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

function upstream(port: number, route: "status" | "synthesize"): string {
  return `http://127.0.0.1:${port}/${route}`;
}

function secret(): string | null {
  const value = process.env[TOKEN_ENV];
  return value && value.length >= 32 && value.length <= 512 ? value : null;
}

async function boundedWav(response: Response): Promise<Buffer> {
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "audio/wav") {
    throw new Error("Invalid speech response");
  }
  const claimedSize = Number(response.headers.get("content-length") ?? "0");
  if (claimedSize > MAX_AUDIO_BYTES) throw new Error("Speech response too large");
  if (!response.body) throw new Error("Empty speech response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUDIO_BYTES) throw new Error("Speech response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = Buffer.concat(chunks, total);
  if (result.length < 44 || result.toString("ascii", 0, 4) !== "RIFF" ||
      result.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV data");
  }
  return result;
}

export function registerSpeechRoutes(app: FastifyInstance, options: {
  config: PalmTTYConfig;
  requireAuth: Guard;
  requireOrigin: Guard;
}): void {
  const limiter = new FixedWindowLimiter(40, 60_000);
  let busy = false;
  const { enabled, port } = options.config.speech.qwen;

  app.get("/api/v1/speech/qwen/status", {
    preHandler: [options.requireAuth]
  }, async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
    if (!enabled) return { enabled: false, ready: false, model: null, speakers: [], styles: [] };
    const token = secret();
    if (!token) return { enabled: true, ready: false, model: null, speakers: [], styles: [] };
    try {
      const response = await fetch(upstream(port, "status"), {
        headers: { authorization: `Bearer ${token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(2500)
      });
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 4096) {
        throw new Error("Unavailable");
      }
      const status: unknown = await response.json();
      if (!status || typeof status !== "object") throw new Error("Invalid status");
      const data = status as Record<string, unknown>;
      if (data.model !== "0.6b" && data.model !== "1.7b") throw new Error("Invalid model");
      return {
        enabled: true,
        ready: true,
        model: data.model,
        speakers,
        styles: data.model === "1.7b" ? ["neutral", "story"] : ["neutral"]
      };
    } catch {
      return { enabled: true, ready: false, model: null, speakers: [], styles: [] };
    }
  });

  app.post("/api/v1/speech/qwen/synthesize", {
    preHandler: [options.requireOrigin, options.requireAuth]
  }, async (request, reply) => {
    reply.header("cache-control", "private, no-store")
      .header("x-content-type-options", "nosniff");
    if (!enabled) return reply.code(404).send({ error: "speech_qwen_disabled" });
    const token = secret();
    if (!token) return reply.code(503).send({ error: "speech_qwen_unavailable" });
    const parsed = QwenRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_speech_request" });
    if (!limiter.allow(request.ip)) return reply.code(429).send({ error: "too_many_speech_requests" });
    if (busy) return reply.code(429).send({ error: "speech_qwen_busy" });
    busy = true;
    try {
      const response = await fetch(upstream(port, "synthesize"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(parsed.data),
        redirect: "manual",
        signal: AbortSignal.timeout(90_000)
      });
      const wav = await boundedWav(response);
      return reply.header("content-type", "audio/wav")
        .header("content-length", String(wav.byteLength))
        .send(wav);
    } catch {
      // Do not log user text, the TTS token, or the upstream's arbitrary error body.
      return reply.code(502).send({ error: "speech_qwen_unavailable" });
    } finally {
      busy = false;
    }
  });
}
