import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { PalmTTYConfig } from "@palmtty/config";
import { spawnOwnedProcess, stopOwnedProcess } from "./owned-process.js";

// Fixed versions and hashes are also the provisioning contract. Never execute PATH discoveries.
export const PRIVATE_NETWORK_TOOLS = [
  { name: "caddy", version: "2.11.7", repository: "caddyserver/caddy", assetId: 607244987, sha256: "0a1edc0b799512051c57071ce0e798d3f2cf67dc98171366f1d2b326072e3b06" },
  { name: "coredns", version: "1.15.0", repository: "coredns/coredns", assetId: 661218355, sha256: "873a0a73edba0930c05ec58f4c62cf1e6d19a4564a38e7914bd305e15912f52b" }
] as const;

export function privateNetworkRoot(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "PalmTTY", "private-network");
}

export function privateGatewayRoutes(config: PalmTTYConfig): { url: string; port: number }[] {
  const exposure = config.server.exposure;
  return [
    ...(exposure.mode === "reverseProxy" ? [{ url: exposure.origins[0]!, port: config.server.port }] : []),
    ...Object.values(config.integrations).flatMap((entry) => entry?.mode === "managed" && entry.url
      ? [{ url: entry.url, port: entry.port }] : [])
  ];
}

export function privateGatewayPorts(config: PalmTTYConfig): number[] {
  return [...new Set([443, 53, ...(config.server.exposure.mode === "reverseProxy" ? [config.server.port] : []),
    ...privateGatewayRoutes(config).filter((route) => new URL(route.url).protocol === "http:").map((route) => Number(new URL(route.url).port || 80))])];
}

export function privateGatewayFiles(config: PalmTTYConfig, root: string): { caddy: string; dns: string } {
  const gateway = config.server.privateGateway;
  const exposure = config.server.exposure;
  if (!gateway || !["lan", "reverseProxy"].includes(exposure.mode)) throw new Error("private_gateway_configuration_required");
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
${exposure.mode === "reverseProxy" ? `http://${gateway.listenHost}:${config.server.port} {
  bind ${gateway.listenHost}
  @outside not remote_ip private_ranges
  respond @outside 403
  @setup path / /PalmTTY-root.crt /PalmTTY-HTTPS.mobileconfig
  @profile path /PalmTTY-HTTPS.mobileconfig
  route {
    root * ${JSON.stringify(path.join(root, "public"))}
    header @profile Content-Type application/x-apple-aspen-config
    file_server @setup
    respond 404
  }
}` : ""}
${routes.map((route) => `${new URL(route.url).origin} {
  bind ${gateway.listenHost}
  ${new URL(route.url).protocol === "https:" ? "tls internal" : ""}
  @outside not remote_ip private_ranges
  respond @outside 403
  header Referrer-Policy no-referrer
  header +Content-Security-Policy "frame-ancestors 'self'"
  reverse_proxy 127.0.0.1:${route.port}
}`).join("\n")}
`;
  const dns = `.:53 {
  bind ${gateway.listenHost}
  acl {
    allow net 127.0.0.0/8 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16
    block
  }
  hosts {
    ${gateway.listenHost} ${routes.map((route) => new URL(route.url).hostname).join(" ")}
    ttl 60
    fallthrough
  }
  forward . ${gateway.upstreamDns} {
    max_concurrent 64
  }
  cache 30
}
`;
  return { caddy, dns };
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
    if (!gateway || this.closed) return;
    if (process.platform !== "win32" || process.arch !== "x64") throw new Error("private_gateway_requires_windows_x64");
    const root = privateNetworkRoot();
    // Never adopt or kill an unknown HTTPS/DNS listener.
    const ports = privateGatewayPorts(this.config);
    for (const port of ports) if (await listening(gateway.listenHost, port)) throw new Error(`private_gateway_port_in_use:${port}`);
    if (this.closed) return;
    const files = privateGatewayFiles(this.config, root);
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "Caddyfile"), files.caddy, { mode: 0o600 });
    await writeFile(path.join(root, "Corefile"), files.dns, { mode: 0o600 });
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
        const child = spawnOwnedProcess({ executable, args: tool.name === "caddy"
          ? ["run", "--config", path.join(root, "Caddyfile"), "--adapter", "caddyfile"]
          : ["-conf", path.join(root, "Corefile")], cwd: root, env });
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
