import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  GitDiffRequestSchema,
  WorkspaceFileListRequestSchema,
  WorkspaceFileReadRequestSchema
} from "@palmtty/protocol";
import { FixedWindowLimiter } from "./security.js";
import {
  listWorkspaceFiles,
  readWorkspaceFile
} from "./workspace-files.js";
import {
  getWorkspaceGitDiff,
  getWorkspaceGitStatus
} from "./workspace-git.js";
import type { WorkspaceStore } from "./workspace-store.js";

type Guard = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<unknown>;

export function registerWorkspaceToolRoutes(
  app: FastifyInstance,
  options: {
    workspaceStore: WorkspaceStore;
    requireAuth: Guard;
    requireOrigin: Guard;
  }
): void {
  const readLimiter = new FixedWindowLimiter(240, 60_000);

  function workspaceFor(id: string) {
    return options.workspaceStore.get(id);
  }

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/files/list",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_tool_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      const parsed = WorkspaceFileListRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_workspace_file_request" });
      }
      try {
        return await listWorkspaceFiles(workspace, parsed.data.path);
      } catch (error) {
        return reply.code(400).send({
          error: "workspace_file_unavailable",
          message: error instanceof Error ? error.message : "Workspace path is unavailable"
        });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/files/read",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_tool_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      const parsed = WorkspaceFileReadRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_workspace_file_request" });
      }
      try {
        return await readWorkspaceFile(workspace, parsed.data.path);
      } catch (error) {
        return reply.code(400).send({
          error: "workspace_file_unavailable",
          message: error instanceof Error ? error.message : "Workspace file is unavailable"
        });
      }
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/git/status",
    { preHandler: options.requireAuth },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_tool_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      try {
        return await getWorkspaceGitStatus(workspace);
      } catch (error) {
        return reply.code(400).send({
          error: "git_unavailable",
          message: error instanceof Error ? error.message : "Git status is unavailable"
        });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/git/diff",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_tool_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      const parsed = GitDiffRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_git_request" });
      }
      try {
        return await getWorkspaceGitDiff(
          workspace,
          parsed.data.path,
          parsed.data.staged
        );
      } catch (error) {
        return reply.code(400).send({
          error: "git_unavailable",
          message: error instanceof Error ? error.message : "Git diff is unavailable"
        });
      }
    }
  );
}
