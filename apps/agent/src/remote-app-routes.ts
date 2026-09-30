import {
  CreateAppSessionSchema,
  RemoteAppOfferRequestSchema
} from "@palmtty/protocol";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { FixedWindowLimiter } from "./security.js";
import type { RemoteAppSessionManager } from "./remote-app-session-manager.js";

const DetachSchema = z.object({
  connectionId: z.string().min(1).max(128)
}).strict();

type Guard = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<unknown> | unknown;

export function registerRemoteAppRoutes(
  app: FastifyInstance,
  options: {
    manager: RemoteAppSessionManager;
    requireAuth: Guard;
    requireOrigin: Guard;
  }
): void {
  const createLimiter = new FixedWindowLimiter(20, 60_000);
  const mutationLimiter = new FixedWindowLimiter(60, 60_000);
  const signalingLimiter = new FixedWindowLimiter(120, 60_000);

  app.get(
    "/api/v1/remote-apps/capabilities",
    { preHandler: options.requireAuth },
    async () => options.manager.capabilities()
  );

  app.get(
    "/api/v1/app-sessions",
    { preHandler: options.requireAuth },
    async () => ({ sessions: options.manager.list() })
  );

  app.post(
    "/api/v1/app-sessions",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!createLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_app_session_requests" });
      }
      const parsed = CreateAppSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_app_session_request" });
      }
      try {
        const session = await options.manager.create(
          parsed.data.workspaceId,
          parsed.data.profileId
        );
        return reply.code(201).send({ session });
      } catch (error) {
        request.log.warn({ err: error }, "Remote App Session creation failed");
        return reply.code(409).send({
          error: "app_session_create_failed",
          message: error instanceof Error
            ? error.message
            : "Remote App Session creation failed"
        });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/app-sessions/:id/offer",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!signalingLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_app_signaling_requests" });
      }
      const parsed = RemoteAppOfferRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_app_offer" });
      }
      try {
        const result = await options.manager.negotiate(
          request.params.id,
          parsed.data.sdp
        );
        return {
          type: "answer" as const,
          sdp: result.answerSdp,
          connectionId: result.clientId
        };
      } catch (error) {
        return reply.code(409).send({
          error: "app_signaling_failed",
          message: error instanceof Error
            ? error.message
            : "Remote App signaling failed"
        });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/app-sessions/:id/detach",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      const parsed = DetachSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_app_detach_request" });
      }
      await options.manager.detach(request.params.id, parsed.data.connectionId);
      return reply.code(204).send();
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/app-sessions/:id/terminate",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!mutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_app_session_requests" });
      }
      const session = await options.manager.terminate(request.params.id);
      if (!session) return reply.code(404).send({ error: "app_session_not_found" });
      return { session };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/app-sessions/:id",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!mutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_app_session_requests" });
      }
      const result = await options.manager.remove(request.params.id);
      if (result === "missing") {
        return reply.code(404).send({ error: "app_session_not_found" });
      }
      if (result === "active") {
        return reply.code(409).send({ error: "app_session_not_stopped" });
      }
      return reply.code(204).send();
    }
  );
}
