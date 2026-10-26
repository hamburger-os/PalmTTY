import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { integrationAccessUrl, type PalmTTYConfig } from "@palmtty/config";
import { AUTH_COOKIE } from "./auth.js";
import { spawnOwnedProcess, stopOwnedProcess } from "./owned-process.js";

// Fixed versions and hashes are also the provisioning contract. Never execute PATH discoveries.
export const PRIVATE_NETWORK_TOOLS = [
  { name: "caddy", version: "2.11.7", repository: "caddyserver/caddy", assetId: 607244987, sha256: "0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06" },
] as const;

export function privateNetworkRoot(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "PalmTTY", "private-network");
}

export function privateGatewayRoutes(config: PalmTTYConfig): { url: string; port: number }[] {
  if (!config.server.privateGateway) return [];
  return (Object.keys(config.integrations) as (keyof PalmTTYConfig["integrations"])[]).flatMap((id) => {
    const entry = config.integrations[id];
    return entry?.mode === "managed" ? [{ url: integrationAccessUrl(config,id)!, port:entry.port }] : [];
  });
}

export function privateGatewayPorts(config: PalmTTYConfig): number[] {
  return privateGatewayRoutes(config).map((route) => Number(new URL(route.url).port || (route.url.startsWith("https:") ? 443 : 80)));
}

export function privateGatewayFiles(config: PalmTTYConfig, root: string): { caddy: string } {
  const gateway = config.server.privateGateway;
  if (!gateway) throw new Error("private_gateway_configuration_required");
  const routes = privateGatewayRoutes(config);
  const caddy = `{
  admin off
  auto_https disable_redirects
  skip_install_trust
  storage file_system {
    root ${JSON.stringify(path.join(root, "pki"))}
  }
  log default {
    level ERROR
    format filter {
      wrap json
      fields {
        request>uri delete
        request>headers delete
        resp_headers delete
      }
    }
  }
}
${routes.map((route) => `${new URL(route.url).origin} {
  bind ${gateway.listenHost}
  ${new URL(route.url).protocol === "https:" ? "tls internal" : ""}
  @outside not remote_ip private_ranges
  respond @outside 403
  header Referrer-Policy no-referrer
  header +Content-Security-Policy "frame-ancestors 'self'"
  reverse_proxy 127.0.0.1:${route.port} {
    header_up Cookie "(^|;[[:space:]]*)${AUTH_COOKIE}=[^;]*" ""
    header_up Cookie "^[;[:space:]]+" ""
  }
}`).join("\n")}
`;
  return { caddy };
}

async function listening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(500);
    const done = (value: boolean) => { socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

export class PrivateGateway {
  private children: ChildProcessWithoutNullStreams[] = [];
  private ready = false;
  private closed = false;
  constructor(private readonly config: PalmTTYConfig, private readonly onFailure: () => void = () => {}) {}
  async start(): Promise<void> {
    const gateway = this.config.server.privateGateway;
    if (!gateway || this.closed || !privateGatewayRoutes(this.config).length) return;
    if (process.platform !== "win32" || process.arch !== "x64") throw new Error("private_gateway_requires_windows_x64");
    const root = privateNetworkRoot();
    // Never adopt or kill an unknown gateway listener.
    const ports = privateGatewayPorts(this.config);
    for (const port of ports) if (await listening(gateway.listenHost, port)) throw new Error(`private_gateway_port_in_use:${port}`);
    if (this.closed) return;
    const files = privateGatewayFiles(this.config, root);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "Caddyfile"), files.caddy, { mode: 0o600 });
    // No workstation tokens, workspace environment or unrelated application credentials.
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA"]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    try {
      if (this.closed) return;
      for (const tool of PRIVATE_NETWORK_TOOLS) {
        const executable = path.join(root, `${tool.name}-${tool.version}.exe`);
        if (!existsSync(executable)) throw new Error("private_gateway_tools_missing:run_deploy_local");
        const child = spawnOwnedProcess({ executable, args: ["run", "--config", path.join(root, "Caddyfile"), "--adapter", "caddyfile"], cwd: root, env });
        child.on("error", () => { if (this.ready) this.onFailure(); });
        child.once("exit", () => { if (this.ready) this.onFailure(); });
        child.stdout.resume(); child.stderr.resume();
        this.children.push(child);
      }
      for (let attempt = 0; attempt < 80; attempt++) {
        if (this.closed) return;
        if (this.children.some((child) => child.exitCode !== null)) throw new Error("private_gateway_start_failed");
        if ((await Promise.all(ports.map((port) => listening(gateway.listenHost, port)))).every(Boolean)) { this.ready = true; return; }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("private_gateway_start_timeout");
    } catch (error) { await this.close(); throw error; }
  }
  async close(): Promise<void> {
    this.closed = true;
    this.ready = false;
    await Promise.all(this.children.map((child) => stopOwnedProcess(child)));
    this.children = [];
  }
}
