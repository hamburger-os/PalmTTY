import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  GitDiffRequestSchema,
  GitHistoryRequestSchema,
  GitMutationRequestSchema,
  GitRemoteRequestSchema,
  WorkspaceFileListRequestSchema,
  WorkspaceFileReadRequestSchema
} from "@palmtty/protocol";
import { FixedWindowLimiter } from "./security.js";
import {
  listWorkspaceFiles,
  readWorkspaceFile
} from "./workspace-files.js";
import {
  getWorkspaceGitBranches,
  getWorkspaceGitDiff,
  getWorkspaceGitHistory,
  getWorkspaceGitStatus,
  mutateWorkspaceGit,
  runWorkspaceGitRemote
} from "./git/index.js";
import type { WorkspaceStore } from "./workspace-store.js";

type Guard = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<unknown>;

function gitFailure(
  reply: FastifyReply,
  error: unknown,
  code: string,
  message: string
) {
  if (error instanceof Error && error.name === "GitStateChangedError") {
    return reply.code(409).send({
      error: "git_state_changed",
      message: error.message
    });
  }
  return reply.code(400).send({
    error: code,
    message: error instanceof Error ? error.message : message
  });
}

export function registerWorkspaceToolRoutes(
  app: FastifyInstance,
  options: {
    workspaceStore: WorkspaceStore;
    requireAuth: Guard;
    requireOrigin: Guard;
    sensitiveEnvironmentKeys: string[];
  }
): void {
  const readLimiter = new FixedWindowLimiter(240, 60_000);
  const mutationLimiter = new FixedWindowLimiter(120, 60_000);
  const remoteLimiter = new FixedWindowLimiter(30, 60_000);

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
        return await listWorkspaceFiles(
          workspace,
          parsed.data.path,
          options.sensitiveEnvironmentKeys
        );
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
        return await readWorkspaceFile(
          workspace,
          parsed.data.path,
          options.sensitiveEnvironmentKeys
        );
      } catch (error) {
        return reply.code(400).send({
          error: "workspace_file_unavailable",
          message: error instanceof Error ? error.message : "Workspace file is unavailable"
        });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/git/status",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_tool_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      try {
        return await getWorkspaceGitStatus(
          workspace,
          options.sensitiveEnvironmentKeys
        );
      } catch (error) {
        return gitFailure(
          reply,
          error,
          "git_unavailable",
          "Git status is unavailable"
        );
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
          parsed.data.staged,
          options.sensitiveEnvironmentKeys
        );
      } catch (error) {
        return gitFailure(
          reply,
          error,
          "git_unavailable",
          "Git diff is unavailable"
        );
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/git/history",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_tool_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      const parsed = GitHistoryRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_git_request" });
      }
      try {
        return await getWorkspaceGitHistory(
          workspace,
          parsed.data.limit,
          options.sensitiveEnvironmentKeys
        );
      } catch (error) {
        return gitFailure(
          reply,
          error,
          "git_unavailable",
          "Git history is unavailable"
        );
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/git/branches",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!readLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_workspace_tool_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      try {
        return await getWorkspaceGitBranches(
          workspace,
          options.sensitiveEnvironmentKeys
        );
      } catch (error) {
        return gitFailure(
          reply,
          error,
          "git_unavailable",
          "Git branches are unavailable"
        );
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/git/mutate",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!mutationLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_git_mutations" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      const parsed = GitMutationRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_git_request" });
      }
      try {
        return await mutateWorkspaceGit(
          workspace,
          parsed.data,
          options.sensitiveEnvironmentKeys
        );
      } catch (error) {
        return gitFailure(
          reply,
          error,
          "git_operation_failed",
          "Git operation failed"
        );
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/workspaces/:id/git/remote",
    { preHandler: [options.requireOrigin, options.requireAuth] },
    async (request, reply) => {
      if (!remoteLimiter.allow(request.ip)) {
        return reply.code(429).send({ error: "too_many_git_remote_requests" });
      }
      const workspace = workspaceFor(request.params.id);
      if (!workspace) return reply.code(404).send({ error: "workspace_not_found" });
      const parsed = GitRemoteRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_git_request" });
      }
      try {
        return await runWorkspaceGitRemote(
          workspace,
          parsed.data,
          options.sensitiveEnvironmentKeys
        );
      } catch (error) {
        return gitFailure(
          reply,
          error,
          "git_remote_failed",
          "Git remote operation failed"
        );
      }
    }
  );
}
