import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { exposureOrigins, secureCookies, type PalmTTYConfig } from "@palmtty/config";
import {
  BrowseDirectoryRequestSchema,
  CreateSessionSchema,
  DetectTerminalProfilesRequestSchema,
  CreateWorkspaceSchema,
  MAX_MESSAGE_BYTES,
  WS_SUBPROTOCOL,
  WorkspaceDefinitionSchema,
  encodeServerMessage,
  parseClientMessage
} from "@palmtty/protocol";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { AUTH_COOKIE, AuthService } from "./auth.js";
import { controlEnvironmentKeys, isReservedControlEnvironmentKey } from "./control-environment.js";
import { browseWorkspaceDirectory } from "./workspace-directory-browser.js";
import { detectTerminalProfiles } from "./terminal-profiles.js";
import { FixedWindowLimiter, isTrustedOrigin } from "./security.js";
import { SessionManager, type SessionManagerOptions } from "./session-manager.js";
import {
  detectRuntimeCapabilities,
  resolveRuntimeWorkspace
} from "./workspace-runtime.js";
import {
  FileWorkspaceStore,
  type WorkspaceStore
} from "./workspace-store.js";
import { registerWorkspaceToolRoutes } from "./workspace-tool-routes.js";
import { PALMTTY_VERSION } from "./version.js";

const LoginSchema = z.object({ token: z.string().min(1).max(4096) });

export type BuildAppOptions = {
  webRoot?: string;
  sessionManager?: Omit<SessionManagerOptions, "workspaceStore">;
  workspaceStore?: WorkspaceStore;
  additionalTrustedOrigins?: readonly string[];
  https?: {
    cert: Buffer;
    key: Buffer;
  };
};

export async function buildApp(config: PalmTTYConfig, options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie"
      ]
    },
    bodyLimit: MAX_MESSAGE_BYTES,
    ...(options.https ? { https: options.https } : {})
  });

  await app.register(cookie);
  await app.register(websocket, {
    options: { maxPayload: MAX_MESSAGE_BYTES },
    errorHandler(error, socket, request) {
      request.log.warn({ err: error }, "WebSocket handler failed");
      try { socket.close(1011, "Terminal connection failed"); } catch { /* ignore */ }
    }
  });

  const auth = new AuthService(config.auth);
  const workspaceStore = options.workspaceStore ?? new FileWorkspaceStore();
  const sessions = new SessionManager(config, {
    ...options.sessionManager,
    workspaceStore
  });
  await sessions.initialize();
  const runtimeCapabilitiesPromise = detectRuntimeCapabilities();
  const createLimiter = new FixedWindowLimiter(20, 60_000);
  const sessionMutationLimiter = new FixedWindowLimiter(60, 60_000);
  const workspaceMutationLimiter = new FixedWindowLimiter(60, 60_000);
  const directoryBrowseLimiter = new FixedWindowLimiter(120, 60_000);
  const terminalProfileLimiter = new FixedWindowLimiter(60, 60_000);

  function authenticated(request: FastifyRequest): boolean {
    return auth.isAuthenticated(request.cookies[AUTH_COOKIE]);
  }

  function workspaceUsesReservedEnvironment(
    environment: Record<string, string> | undefined
  ): boolean {
    if (!environment) return false;
    return Object.keys(environment).some((key) => (
      isReservedControlEnvironmentKey(key, config.auth.tokenEnv)
    ));
  }

  async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    if (!authenticated(request)) {
      return reply.code(401).send({ error: "authentication_required" });
    }
  }

  async function requireOrigin(request: FastifyRequest, reply: FastifyReply) {
    const trustedOrigins = [
      ...exposureOrigins(config),
      ...(options.additionalTrustedOrigins ?? [])
    ];
    if (!isTrustedOrigin(request.headers.origin, trustedOrigins)) {
      request.log.warn({ origin: request.headers.origin }, "Rejected untrusted origin");
      return reply.code(403).send({ error: "untrusted_origin" });
    }
  }

  app.get("/api/v1/health", async () => ({
    status: "ok",
    version: PALMTTY_VERSION,
    platform: process.platform
  }));

  app.get("/api/v1/auth/status", async (request) => ({
    enabled: auth.enabled,
    authenticated: authenticated(request)
  }));

  app.post("/api/v1/auth/login", { preHandler: requireOrigin }, async (request, reply) => {
    if (!auth.enabled) return reply.code(204).send();

    if (!auth.canAttemptLogin(request.ip)) {
      return reply.code(429).send({ error: "too_many_attempts" });
    }

    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success || !auth.verifyToken(request.ip, parsed.data.token)) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const loginSession = auth.createLoginSession();
    reply.setCookie(AUTH_COOKIE, loginSession, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookies(config),
      maxAge: config.auth.sessionTtlMinutes * 60
    });
    return reply.code(204).send();
  });

  app.post("/api/v1/auth/logout", { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    auth.revoke(request.cookies[AUTH_COOKIE]);
    reply.clearCookie(AUTH_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/v1/capabilities", { preHandler: requireAuth }, async () => (
    runtimeCapabilitiesPromise
  ));

  app.post(
    "/api/v1/terminal-profiles",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!terminalProfileLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_terminal_profile_requests" });
      }
      const parsed = DetectTerminalProfilesRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_terminal_profile_request" });
      }
      try {
        return { profiles: await detectTerminalProfiles() };
      } catch (error) {
        return reply.code(400).send({
          error: "terminal_profile_detection_failed",
          message: error instanceof Error
            ? error.message
            : "Terminal profile discovery failed"
        });
      }
    }
  );

  app.post(
    "/api/v1/workspace-directories/browse",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!directoryBrowseLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_directory_requests" });
      }
      const parsed = BrowseDirectoryRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_directory_request" });
      }
      try {
        return await browseWorkspaceDirectory(parsed.data);
      } catch (error) {
        return reply.code(400).send({
          error: "directory_unavailable",
          message: error instanceof Error
            ? error.message
            : "Directory is unavailable"
        });
      }
    }
  );

  registerWorkspaceToolRoutes(app, {
    workspaceStore,
    requireAuth,
    requireOrigin,
    sensitiveEnvironmentKeys: controlEnvironmentKeys(config.auth.tokenEnv)
  });

  app.get("/api/v1/workspaces", { preHandler: requireAuth }, async () => ({
    workspaces: workspaceStore.list()
  }));

  app.post(
    "/api/v1/workspaces",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!workspaceMutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_requests" });
      }
      const parsed = CreateWorkspaceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_workspace_request" });
      }
      if (workspaceUsesReservedEnvironment(parsed.data.environment)) {
        return reply.code(400).send({
          error: "workspace_invalid",
          message: "PalmTTY control environment variables are reserved"
        });
      }

      const workspace = WorkspaceDefinitionSchema.parse({
        id: randomUUID(),
        ...parsed.data
      });
      try {
        await resolveRuntimeWorkspace(workspace);
        await workspaceStore.create(workspace);
        return reply.code(201).send({ workspace });
      } catch (error) {
        return reply.code(400).send({
          error: "workspace_invalid",
          message: error instanceof Error ? error.message : "Workspace validation failed"
        });
      }
    }
  );

  app.put<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!workspaceMutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_requests" });
      }
      if (!workspaceStore.get(request.params.id)) {
        return reply.code(404).send({ error: "workspace_not_found" });
      }
      const parsed = CreateWorkspaceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_workspace_request" });
      }
      if (workspaceUsesReservedEnvironment(parsed.data.environment)) {
        return reply.code(400).send({
          error: "workspace_invalid",
          message: "PalmTTY control environment variables are reserved"
        });
      }

      const workspace = WorkspaceDefinitionSchema.parse({
        id: request.params.id,
        ...parsed.data
      });
      try {
        await resolveRuntimeWorkspace(workspace);
        if (!await workspaceStore.replace(request.params.id, workspace)) {
          return reply.code(404).send({ error: "workspace_not_found" });
        }
        return { workspace };
      } catch (error) {
        return reply.code(400).send({
          error: "workspace_invalid",
          message: error instanceof Error ? error.message : "Workspace validation failed"
        });
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!workspaceMutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_requests" });
      }
      if (!workspaceStore.get(request.params.id)) {
        return reply.code(404).send({ error: "workspace_not_found" });
      }
      if (sessions.hasActiveWorkspaceSessions(request.params.id)) {
        return reply.code(409).send({ error: "workspace_in_use" });
      }
      await workspaceStore.delete(request.params.id);
      return reply.code(204).send();
    }
  );

  app.get("/api/v1/sessions", { preHandler: requireAuth }, async () => ({
    sessions: sessions.list()
  }));

  app.get<{ Params: { id: string } }>("/api/v1/sessions/:id", { preHandler: requireAuth }, async (request, reply) => {
    const session = sessions.get(request.params.id);
    if (!session) return reply.code(404).send({ error: "session_not_found" });
    return { session };
  });

  app.post("/api/v1/sessions", { preHandler: [requireOrigin, requireAuth] }, async (request, reply) => {
    if (!createLimiter.allow(request.ip)) {
      return reply.code(429).send({ error: "too_many_session_requests" });
    }
    const parsed = CreateSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_session_request" });
    }
    try {
      const session = await sessions.create(parsed.data.workspaceId, parsed.data.cols, parsed.data.rows);
      return reply.code(201).send({ session });
    } catch (error) {
      request.log.warn({ err: error }, "Session creation failed");
      return reply.code(409).send({
        error: "session_create_failed",
        message: error instanceof Error ? error.message : "Session creation failed"
      });
    }
  });

  app.post<{ Params: { id: string } }>(
    "/api/v1/sessions/:id/terminate",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!sessionMutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_session_requests" });
      }
      const session = await sessions.terminate(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }
      const terminal = session.state === "exited" || session.state === "failed";
      return reply.code(terminal ? 200 : 202).send({ session });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/sessions/:id/restart",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!sessionMutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_session_requests" });
      }
      try {
        const session = await sessions.restart(request.params.id);
        if (!session) {
          return reply.code(404).send({ error: "session_not_found" });
        }
        return reply.code(201).send({ session });
      } catch (error) {
        request.log.warn({ err: error }, "Session restart failed");
        return reply.code(409).send({
          error: "session_restart_failed",
          message: error instanceof Error ? error.message : "Session restart failed"
        });
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/sessions/:id",
    { preHandler: [requireOrigin, requireAuth] },
    async (request, reply) => {
      if (!sessionMutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_session_requests" });
      }
      const result = await sessions.remove(request.params.id);
      if (result === "not_found") {
        return reply.code(404).send({ error: "session_not_found" });
      }
      if (result === "active") {
        return reply.code(409).send({ error: "session_not_stopped" });
      }
      return reply.code(204).send();
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/sessions/:id/terminal",
    { websocket: true, preValidation: [requireOrigin, requireAuth] },
    (socket, request) => {
      const id = request.params.id;
      if (!sessions.has(id)) {
        socket.close(1008, "Unknown session");
        return;
      }

      if (socket.protocol !== WS_SUBPROTOCOL) {
        socket.close(1002, "Unsupported PalmTTY protocol");
        return;
      }

      let attached = false;
      let messagePipeline = Promise.resolve();
      const authSessionId = request.cookies[AUTH_COOKIE];
      const authRemainingMs = auth.enabled ? auth.remainingSessionMs(authSessionId) : undefined;
      if (auth.enabled && authRemainingMs === undefined) {
        socket.close(1008, "Authentication expired");
        return;
      }
      const authExpiryTimer = auth.enabled && authRemainingMs !== undefined
        ? setTimeout(() => socket.close(1008, "Authentication expired"), authRemainingMs)
        : undefined;
      authExpiryTimer?.unref();

      const resumeTimer = setTimeout(() => {
        if (!attached) socket.close(1008, "Resume handshake required");
      }, 5_000);
      resumeTimer.unref();

      socket.on("message", (raw, isBinary) => {
        const handleMessage = async () => {
          if (isBinary) {
            socket.close(1003, "Binary frames are unsupported");
            return;
          }

          try {
            const message = parseClientMessage(raw.toString());

            if (message.type === "resume") {
              if (attached) return;
              await sessions.attach(
                id,
                socket,
                message.lastSeq,
                message.cols,
                message.rows
              );
              attached = true;
              clearTimeout(resumeTimer);
              return;
            }

            if (message.type === "ping") {
              socket.send(encodeServerMessage({ type: "pong", id: message.id }));
              return;
            }

            if (!attached) {
              socket.close(1008, "Resume handshake required");
              return;
            }

            if (message.type === "input") {
              await sessions.write(id, message.data);
            } else if (message.type === "resize") {
              await sessions.resize(id, message.cols, message.rows);
            }
          } catch (error) {
            request.log.debug({ err: error }, "Rejected terminal protocol frame");
            if (socket.readyState === 1) {
              socket.send(encodeServerMessage({
                type: "error",
                code: "INVALID_MESSAGE",
                message: "The terminal message was invalid."
              }));
            }
          }
        };

        const run = messagePipeline.then(handleMessage, handleMessage);
        messagePipeline = run.then(() => undefined, () => undefined);
      });

      socket.on("close", () => {
        clearTimeout(resumeTimer);
        if (authExpiryTimer) clearTimeout(authExpiryTimer);
        sessions.detach(id, socket);
      });
    }
  );

  const defaultWebRoot = fileURLToPath(new URL("../../web/dist/", import.meta.url));
  const webRoot = options.webRoot ?? defaultWebRoot;
  const hasWeb = existsSync(path.join(webRoot, "index.html"));

  if (hasWeb) {
    await app.register(fastifyStatic, { root: webRoot });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (hasWeb) return reply.sendFile("index.html");
    return reply.code(404).send({
      error: "web_not_built",
      message: "Run pnpm build before starting PalmTTY."
    });
  });

  app.addHook("onClose", async () => {
    await sessions.close();
  });

  return app;
}
