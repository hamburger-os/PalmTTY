import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ServerConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(7688),
  trustedOrigins: z.array(z.string().url()).default([]),
  secureCookies: z.boolean().default(false),
  unsafeAllowInsecureLan: z.boolean().default(false)
}).strict();

const AuthConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tokenEnv: z.string().min(1).default("PALMTTY_ACCESS_TOKEN"),
  maxLoginSessions: z.number().int().min(1).max(256).default(32),
  sessionTtlMinutes: z.number().int().min(5).max(10080).default(720)
}).strict();

const SessionConfigSchema = z.object({
  maxSessions: z.number().int().min(1).max(64).default(8),
  exitedRetentionMinutes: z.number().int().min(1).max(1440).default(30),
  scrollbackLines: z.number().int().min(100).max(20000).default(10000),
  replayBytes: z.number().int().min(65536).max(64 * 1024 * 1024).default(2 * 1024 * 1024),
  maxSocketBufferedBytes: z.number().int().min(65536).max(64 * 1024 * 1024).default(2 * 1024 * 1024)
}).strict();

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
    maxLoginSessions: 32,
    sessionTtlMinutes: 720
  }),
  sessions: SessionConfigSchema.default({
    maxSessions: 8,
    exitedRetentionMinutes: 30,
    scrollbackLines: 10000,
    replayBytes: 2 * 1024 * 1024,
    maxSocketBufferedBytes: 2 * 1024 * 1024
  })
}).strict();

export type PalmTTYConfig = z.infer<typeof PalmTTYConfigSchema>;

export function parseConfig(input: unknown): PalmTTYConfig {
  return PalmTTYConfigSchema.parse(input);
}

export async function loadConfig(filePath: string): Promise<PalmTTYConfig> {
  const source = await readFile(filePath, "utf8");
  return parseConfig(parseYaml(source));
}

export function defaultConfigPath(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), "PalmTTY", "config.yaml");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "PalmTTY",
      "config.yaml"
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
    "palmtty",
    "config.yaml"
  );
}

export function configPathFromEnvironment(): string {
  return process.env.PALMTTY_CONFIG
    ? path.resolve(process.env.PALMTTY_CONFIG)
    : defaultConfigPath();
}

export function localAgentUrl(
  config: Pick<PalmTTYConfig, "server">
): string {
  const normalized = config.server.host.trim().replace(/^\[|\]$/g, "");
  const host = normalized === "0.0.0.0"
    ? "127.0.0.1"
    : normalized === "::"
      ? "[::1]"
      : normalized.includes(":")
        ? `[${normalized}]`
        : normalized;
  return `http://${host}:${config.server.port}`;
}
