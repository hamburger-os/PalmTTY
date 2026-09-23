import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import {
  MAX_SESSION_ARTIFACT_BYTES,
  SessionArtifactContentRequestSchema,
  SessionArtifactIdSchema,
  SessionArtifactListRequestSchema,
  SessionArtifactListResponseSchema
} from "@palmtty/protocol";
import { FixedWindowLimiter } from "./security.js";
import type { SessionArtifactStore } from "./session-artifacts.js";
import type { SessionManager } from "./session-manager.js";

type Guard = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<unknown>;

function filenameHeader(request: FastifyRequest): string {
  const value = request.headers["x-palmtty-filename"];
  if (typeof value !== "string" || value.length < 1 || value.length > 1024) {
    throw new Error("Attachment filename header is required");
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.length < 1 || decoded.length > 240) {
      throw new Error("Attachment filename is invalid");
    }
    return decoded;
  } catch {
    throw new Error("Attachment filename is invalid");
  }
}

export function registerSessionArtifactRoutes(
  app: FastifyInstance,
  options: {
    sessions: SessionManager;
    artifacts: SessionArtifactStore;
    requireAuth: Guard;
    requireOrigin: Guard;
    sensitiveEnvironmentKeys: string[];
  }
): void {
  const readLimiter = new FixedWindowLimiter(240, 60_000);
  const uploadLimiter = new FixedWindowLimiter(30, 60_000);
  const mutationLimiter = new FixedWindowLimiter(120, 60_000);

  app.post<{ Params: { id: string } }>(
    "/api/v1/sessions/:id/artifacts/list",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_artifact_requests" });
      }
      if (!options.sessions.has(request.params.id)) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      const parsed = SessionArtifactListRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_artifact_request" });
      }
      return SessionArtifactListResponseSchema.parse({
        artifacts: await options.artifacts.list(request.params.id)
      });
    }
  );

  app.post<{ Params: { id: string; artifactId: string } }>(
    "/api/v1/sessions/:id/artifacts/:artifactId/content",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_artifact_requests" });
      }
      if (!options.sessions.has(request.params.id)) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      const parsedId = SessionArtifactIdSchema.safeParse(request.params.artifactId);
      const parsedBody = SessionArtifactContentRequestSchema.safeParse(request.body);
      if (!parsedId.success || !parsedBody.success) {
        return reply.code(400).send({ error: "invalid_artifact_request" });
      }
      try {
        const result = await options.artifacts.read(
          request.params.id,
          parsedId.data
        );
        return reply
          .header("content-type", result.artifact.mime)
          .header("content-length", String(result.content.length))
          .header("cache-control", "private, no-store")
          .header("x-content-type-options", "nosniff")
          .send(result.content);
      } catch {
        return reply.code(404).send({ error: "artifact_not_found" });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/sessions/:id/artifacts/upload",
    {
      bodyLimit: MAX_SESSION_ARTIFACT_BYTES,
      preHandler: [options.requireOrigin, options.requireAuth]
    },
    async (request, reply) => {
      if (!uploadLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_artifact_uploads" });
      }
      const session = options.sessions.get(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      if (session.state !== "running") {
        return reply.code(409).send({ error: "session_not_running" });
      }
      const launchRuntime = options.sessions.getLaunchRuntime(session.id);
      if (!launchRuntime) {
        return reply.code(500).send({ error: "session_runtime_unavailable" });
      }
      if (!Buffer.isBuffer(request.body)) {
        return reply.code(400).send({ error: "invalid_artifact_request" });
      }

      try {
        const artifact = await options.artifacts.upload(
          session.id,
          launchRuntime,
          filenameHeader(request),
          request.body,
          options.sensitiveEnvironmentKeys
        );
        return reply.code(201).send({ artifact });
      } catch (error) {
        return reply.code(400).send({
          error: "artifact_upload_failed",
          message: error instanceof Error ? error.message : "Attachment upload failed"
        });
      }
    }
  );

  app.delete<{ Params: { id: string; artifactId: string } }>(
    "/api/v1/sessions/:id/artifacts/:artifactId",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!mutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_artifact_requests" });
      }
      if (!options.sessions.has(request.params.id)) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      const parsedId = SessionArtifactIdSchema.safeParse(request.params.artifactId);
      if (!parsedId.success) {
        return reply.code(400).send({ error: "invalid_artifact_request" });
      }
      const deleted = await options.artifacts.delete(
        request.params.id,
        parsedId.data
      );
      if (!deleted) {
        return reply.code(404).send({ error: "artifact_not_found" });
      }
      return reply.code(204).send();
    }
  );
}
