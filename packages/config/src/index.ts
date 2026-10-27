import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ExactHttpOriginSchema = z.string().superRefine((value, ctx) => {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      ctx.addIssue({ code: "custom", message: "Origin must be an http(s) origin without credentials" });
      return;
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      ctx.addIssue({ code: "custom", message: "Origin must contain only scheme, host, and optional port" });
    }
  } catch {
    ctx.addIssue({ code: "custom", message: "Origin must be a valid absolute URL" });
  }
});

const ExactHttpsOriginSchema = ExactHttpOriginSchema.superRefine((value, ctx) => {
  try {
    if (new URL(value).protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: "Origin must use https" });
    }
  } catch {
    // The base schema reports the URL error.
  }
});

const ExposureSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("local")
  }).strict(),
  z.object({
    mode: z.literal("lan")
  }).strict(),
  z.object({
    mode: z.literal("reverseProxy"),
    listenHost: z.string().min(1).default("127.0.0.1"),
    origins: z.array(ExactHttpsOriginSchema).min(1)
  }).strict(),
  z.object({
    mode: z.literal("https"),
    listenHost: z.string().min(1).default("0.0.0.0"),
    origins: z.array(ExactHttpsOriginSchema).min(1),
    certificatePath: z.string().min(1),
    privateKeyPath: z.string().min(1)
  }).strict()
]);

const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(7688),
  privateGateway: z.object({
    listenHost: z.string().refine((value) => isPrivateIpv4(value) && !value.startsWith("127."), "Use a concrete private IPv4 address"),
    httpsPort: z.number().int().min(1).max(65535).default(443)
  }).strict().optional(),
  exposure: ExposureSchema.default({ mode: "local" })
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

const SpeechConfigSchema = z.object({
  qwen: z.object({
    enabled: z.boolean().default(false),
    port: z.number().int().min(1024).max(65535).default(18765)
  }).strict().default({ enabled: false, port: 18765 })
}).strict();

const IntegrationUrlSchema = z.string().url().superRefine((value, ctx) => {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash) {
    ctx.addIssue({ code: "custom", message: "External integration URL must be HTTPS or loopback HTTP, without credentials, query or fragment" });
  }
});
const integrationSchema = (port: number) => z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("external"), url: IntegrationUrlSchema }).strict(),
  z.object({
    mode: z.literal("managed"),
    port: z.number().int().min(1024).max(65535).default(port),
    autoStart: z.boolean().default(false)
  }).strict()
]);
const IntegrationsConfigSchema = z.object({
  vscodeWeb: integrationSchema(8000).optional(),
  harness: integrationSchema(3080).optional()
}).strict();

export const PalmTTYConfigSchema = z.object({
  server: ServerConfigSchema.default({
    port: 7688,
    exposure: { mode: "local" }
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
  }),
  speech: SpeechConfigSchema.default({ qwen: { enabled: false, port: 18765 } }),
  integrations: IntegrationsConfigSchema.default({})
}).strict().superRefine((config, ctx) => {
  const gateway = config.server.privateGateway;
  const managed = Object.values(config.integrations).filter((entry) => entry?.mode === "managed");
  if (gateway) {
    if (config.server.exposure.mode !== "lan" || !managed.length) {
      ctx.addIssue({code:"custom",path:["server","privateGateway"],message:"IP gateway requires LAN exposure and at least one managed application"});
    }
    if (config.integrations.vscodeWeb?.mode === "managed" &&
        [config.server.port, ...managed.map((entry) => entry.port)].includes(gateway.httpsPort)) {
      ctx.addIssue({code:"custom",path:["server","privateGateway","httpsPort"],message:"Code HTTPS entry must not collide with Agent or managed listener ports"});
    }
  }
  const entries = Object.entries(config.integrations);
  const exposure = config.server.exposure;
  const origins = exposure.mode === "https" || exposure.mode === "reverseProxy"
    ? exposure.origins.map((value) => new URL(value).origin)
    : [`http://127.0.0.1:${config.server.port}`, `http://localhost:${config.server.port}`];
  const ports = new Set<number>([config.server.port]);
  const appOrigins = new Set<string>();
  const httpsHosts = new Set(origins.filter((origin) => origin.startsWith("https:")).map((origin) => new URL(origin).hostname));
  for (const [id, entry] of entries) {
    if (!entry) continue;
    if (entry.mode === "managed") {
      if (ports.has(entry.port)) ctx.addIssue({ code: "custom", path: ["integrations", id, "port"], message: "Managed listeners must use distinct ports" });
      ports.add(entry.port);
    }
    const uri = new URL(entry.mode === "external" ? entry.url : managedAccessUrl(id,entry.port,gateway));
    if (entry.mode === "external" && uri.protocol === "https:") {
      if (httpsHosts.has(uri.hostname)) {
        ctx.addIssue({ code: "custom", path: ["integrations", id, "url"], message: "External HTTPS application hosts must differ; cookies are not isolated by port" });
      }
      httpsHosts.add(uri.hostname);
    }
    if (uri.pathname !== "/" || origins.includes(uri.origin) || appOrigins.has(uri.origin)) {
      ctx.addIssue({ code: "custom", path: ["integrations", id], message: "Each application needs a distinct root Origin, separate from PalmTTY" });
    }
    appOrigins.add(uri.origin);
  }
});

export type PalmTTYConfig = z.infer<typeof PalmTTYConfigSchema>;
/** Canonical access target: managed entries never duplicate the gateway IP or URL. */
export function integrationAccessUrl(config: PalmTTYConfig, id: keyof PalmTTYConfig["integrations"]): string | undefined {
  const entry = config.integrations[id];
  if (!entry) return undefined;
  if (entry.mode === "external") return entry.url;
  return managedAccessUrl(id,entry.port,config.server.privateGateway);
}

function managedAccessUrl(id: string, port: number, gateway?: {listenHost:string;httpsPort:number}): string {
  if (!gateway) return `http://127.0.0.1:${port}/`;
  return new URL(id === "vscodeWeb"
    ? `https://${gateway.listenHost}:${gateway.httpsPort}/`
    : `http://${gateway.listenHost}:${port}/`).href;
}

export type NetworkInterfaces = ReturnType<typeof os.networkInterfaces>;

export function parseConfig(input: unknown): PalmTTYConfig {
  return PalmTTYConfigSchema.parse(input);
}

function resolveConfigRelativePath(configDir: string, value: string): string {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(configDir, value);
}

function resolveConfigPaths(config: PalmTTYConfig, configPath: string): PalmTTYConfig {
  if (config.server.exposure.mode !== "https") return config;
  const configDir = path.dirname(configPath);
  return {
    ...config,
    server: {
      ...config.server,
      exposure: {
        ...config.server.exposure,
        certificatePath: resolveConfigRelativePath(configDir, config.server.exposure.certificatePath),
        privateKeyPath: resolveConfigRelativePath(configDir, config.server.exposure.privateKeyPath)
      }
    }
  };
}

export async function loadConfig(filePath: string): Promise<PalmTTYConfig> {
  const resolvedPath = path.resolve(filePath);
  const source = await readFile(resolvedPath, "utf8");
  return resolveConfigPaths(parseConfig(parseYaml(source)), resolvedPath);
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

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function isPrivateIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map(Number);
  const a = octets[0]!;
  const b = octets[1]!;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function privateIpv4Addresses(
  networkInterfaces: NetworkInterfaces = os.networkInterfaces()
): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      const family = String(entry.family);
      const ipv4 = family === "IPv4" || family === "4";
      if (!ipv4 || entry.internal || !isPrivateIpv4(entry.address)) continue;
      addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}

export function serverBindHost(config: Pick<PalmTTYConfig, "server">): string {
  switch (config.server.exposure.mode) {
    case "local":
      return "127.0.0.1";
    case "lan":
      return "0.0.0.0";
    case "reverseProxy":
    case "https":
      return config.server.exposure.listenHost;
  }
}

export function serverScheme(config: Pick<PalmTTYConfig, "server">): "http" | "https" {
  return config.server.exposure.mode === "https" ? "https" : "http";
}

export function secureCookies(config: Pick<PalmTTYConfig, "server">): boolean {
  return config.server.exposure.mode === "https" || config.server.exposure.mode === "reverseProxy";
}

function formatUrlHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export function localAgentUrl(config: Pick<PalmTTYConfig, "server">): string {
  const bindHost = serverBindHost(config);
  const host = bindHost === "0.0.0.0"
    ? "127.0.0.1"
    : bindHost === "::"
      ? "::1"
      : bindHost;
  return `${serverScheme(config)}://${formatUrlHost(host)}:${config.server.port}`;
}

function localOrigins(port: number, scheme: "http" | "https"): string[] {
  return [
    `${scheme}://127.0.0.1:${port}`,
    `${scheme}://localhost:${port}`
  ];
}

export function exposureOrigins(
  config: Pick<PalmTTYConfig, "server">,
  networkInterfaces: NetworkInterfaces = os.networkInterfaces()
): string[] {
  const { exposure, port } = config.server;
  if (exposure.mode === "reverseProxy" || exposure.mode === "https") {
    return [...new Set(exposure.origins.map((value) => new URL(value).origin.toLowerCase()))];
  }

  const origins = new Set(localOrigins(port, "http"));
  if (exposure.mode === "lan") {
    for (const address of privateIpv4Addresses(networkInterfaces)) {
      origins.add(`http://${address}:${port}`);
    }
  }
  return [...origins];
}

export function lanAgentUrls(
  config: Pick<PalmTTYConfig, "server">,
  networkInterfaces: NetworkInterfaces = os.networkInterfaces()
): string[] {
  if (config.server.exposure.mode !== "lan") return [];
  return privateIpv4Addresses(networkInterfaces)
    .map((address) => `http://${address}:${config.server.port}`);
}

export { findOfficialVSCodeCli, officialVSCodeCliCandidates } from "./vscode-cli.js";

export { findOfficialHarnessCli } from "./harness-cli.js";
