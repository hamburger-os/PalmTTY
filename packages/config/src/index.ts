import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const WorkspaceConfigSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(100),
  cwd: z.string().min(1),
  shell: z.enum(["pwsh", "custom"]).default("pwsh"),
  shellPath: z.string().min(1).optional(),
  args: z.array(z.string()).max(32).default(["-NoLogo"]),
  command: z.string().max(8192).optional(),
  env: z.record(z.string(), z.string()).default({})
}).superRefine((workspace, ctx) => {
  if (workspace.shell === "custom" && !workspace.shellPath) {
    ctx.addIssue({ code: "custom", path: ["shellPath"], message: "custom shell requires shellPath" });
  }
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(7688),
  trustedOrigins: z.array(z.string().url()).default([]),
  secureCookies: z.boolean().default(false),
  unsafeAllowInsecureLan: z.boolean().default(false)
});

const AuthConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokenEnv: z.string().min(1).default("PALMTTY_ACCESS_TOKEN"),
  sessionTtlMinutes: z.number().int().min(5).max(10080).default(720)
});

const SessionConfigSchema = z.object({
  maxSessions: z.number().int().min(1).max(64).default(8),
  scrollbackLines: z.number().int().min(100).max(100000).default(10000),
  replayBytes: z.number().int().min(65536).max(64 * 1024 * 1024).default(2 * 1024 * 1024),
  maxSocketBufferedBytes: z.number().int().min(65536).max(64 * 1024 * 1024).default(2 * 1024 * 1024)
});

export const PalmTTYConfigSchema = z.object({
  server: ServerConfigSchema.default({
    host: "127.0.0.1",
    port: 7688,
    trustedOrigins: [],
    secureCookies: false,
    unsafeAllowInsecureLan: false
  }),
  auth: AuthConfigSchema.default({
    enabled: true,
    tokenEnv: "PALMTTY_ACCESS_TOKEN",
    sessionTtlMinutes: 720
  }),
  sessions: SessionConfigSchema.default({
    maxSessions: 8,
    scrollbackLines: 10000,
    replayBytes: 2 * 1024 * 1024,
    maxSocketBufferedBytes: 2 * 1024 * 1024
  }),
  workspaces: z.array(WorkspaceConfigSchema).min(1)
}).superRefine((config, ctx) => {
  const seen = new Set<string>();
  config.workspaces.forEach((workspace, index) => {
    if (seen.has(workspace.id)) {
      ctx.addIssue({ code: "custom", path: ["workspaces", index, "id"], message: "workspace id must be unique" });
    }
    seen.add(workspace.id);
  });
});

export type PalmTTYConfig = z.infer<typeof PalmTTYConfigSchema>;

export function parseConfig(input: unknown): PalmTTYConfig {
  return PalmTTYConfigSchema.parse(input);
}

export async function loadConfig(filePath: string): Promise<PalmTTYConfig> {
  const source = await readFile(filePath, "utf8");
  return parseConfig(parseYaml(source));
}

export function publicWorkspace(workspace: WorkspaceConfig) {
  return {
    id: workspace.id,
    name: workspace.name,
    shell: workspace.shell,
    ...(workspace.command ? { startupCommand: workspace.command } : {})
  };
}
