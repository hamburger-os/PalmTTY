import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { findOfficialVSCodeCli, integrationAccessUrl, type PalmTTYConfig } from "@palmtty/config";
import { WEB_APP_IDS, type WebAppCatalog, type WebAppId, type WebAppPhase, type WebAppStatus } from "@palmtty/protocol";
import { runBoundedProcess } from "./bounded-process.js";
import { spawnOwnedProcess, stopOwnedProcess } from "./owned-process.js";

export const HARNESS_PIN = "0.2.1-rc.2";
const MAX_LOG_BYTES = 8192;
const STARTUP_TIMEOUT_MS = { vscodeWeb: 75_000, harness: 180_000 } as const;
const INSTALL_TIMEOUT_MS = 600_000;

/** Parse only complete readiness lines: a stream chunk may split a token. */
export function parseHarnessReadyUrl(output: string, expectedOrigin?: string): string | undefined {
  const candidate = /(?:^|\n)dsh web:[ \t]+(https?:\/\/[^\s"'<>]+)\r?\n/u.exec(output)?.[1];
  return candidate ? validatedLaunchUrl(candidate, expectedOrigin) : undefined;
}
function validatedLaunchUrl(candidate: string, expectedOrigin?: string): string | undefined {
  try {
    const url = new URL(candidate);
    const local = url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      Number(url.port) > 0 && Number(url.port) <= 65535;
    if ((expectedOrigin ? url.origin !== expectedOrigin : !local) || url.username || url.password || url.pathname !== "/" || url.hash) return undefined;
    return url.href;
  } catch { return undefined; }
}
async function exists(filename: string): Promise<boolean> {
  try { await access(filename); return true; } catch { return false; }
}
function personalAppRoot(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share"), "PalmTTY", "web-apps");
}
function npmCliCandidates(): string[] {
  const base = path.dirname(process.execPath);
  return [
    path.join(base, "npm", "bin", "npm-cli.js"),
    ...(process.env.npm_execpath?.endsWith("npm-cli.js")
      ? [process.env.npm_execpath] : []),
    path.join(base, "node_modules", "npm", "bin", "npm-cli.js"),
    ...(process.platform === "win32"
      ? [path.join(process.env.ProgramFiles ?? "C:\\Program Files",
          "nodejs", "node_modules", "npm", "bin", "npm-cli.js")] : []),
    path.join(base, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    "/usr/local/lib/node_modules/npm/bin/npm-cli.js",
    "/usr/lib/node_modules/npm/bin/npm-cli.js"
  ];
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const item of paths) {
    if (await exists(item)) return item;
  }
  return undefined;
}

function harnessBinAt(prefix: string): string {
  return path.join(prefix, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}
function managedHarnessBin(root: string): string {
  return harnessBinAt(path.join(root, "harness"));
}

/** Reject an abandoned or wrong-version npm install before exposing a CLI. */
export async function isPinnedHarnessPackage(prefix: string): Promise<boolean> {
  try {
    const manifest = path.join(prefix, "node_modules", "@deepseek-ai", "dsh", "package.json");
    const info: unknown = JSON.parse(await readFile(manifest, "utf8"));
    return typeof info === "object" && info !== null &&
      "name" in info && info.name === "@deepseek-ai/dsh" &&
      "version" in info && info.version === HARNESS_PIN &&
      await exists(harnessBinAt(prefix));
  } catch {
    return false;
  }
}


export function thirdPartyEnvironment(tokenEnv: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.toUpperCase().startsWith("PALMTTY_") || name.toUpperCase() === tokenEnv.toUpperCase()) delete env[name];
  }
  return env;
}
function failureDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return ["install_timeout", "startup_timeout", "port_in_use", "npm_unavailable", "install_failed", "vscode_not_detected"].includes(message)
    ? message : "process_failed";
}
async function assertFreePort(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error("port_in_use")));
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () => probe.close(() => resolve()));
  });
}
type AppState = {
  phase: WebAppPhase;
  detail: string | undefined;
  process: ChildProcessWithoutNullStreams | undefined;
  launchUrl: string | undefined;
  ensure: Promise<void> | undefined;
};
function initialState(): AppState {
  return { phase: "installed", detail: undefined, process: undefined, launchUrl: undefined, ensure: undefined };
}

export class ManagedWebApps {
  private readonly states: Record<WebAppId, AppState> = { vscodeWeb: initialState(), harness: initialState() };
  private readonly installerAbort = new AbortController();
  private closed = false;
  constructor(private readonly config: PalmTTYConfig, private readonly appRoot = personalAppRoot()) {}

  /** Deployment owns startup; polling and browser authentication have no launch side effects. */
  start(): void {
    for (const id of WEB_APP_IDS) {
      const entry = this.config.integrations[id];
      if (entry?.mode === "managed" && entry.autoStart) void this.ensure(id);
    }
  }
  async discover(): Promise<void> {
    for (const id of WEB_APP_IDS) {
      const entry = this.config.integrations[id];
      const state = this.states[id];
      if (!entry) { state.phase = "disabled"; continue; }
      if (entry.mode === "external") { state.phase = "external"; continue; }
      if (!["installed", "not_installed"].includes(state.phase)) continue;
      const present = id === "vscodeWeb" ? Boolean(await findOfficialVSCodeCli())
        : await isPinnedHarnessPackage(path.join(this.appRoot, "harness"));
      state.phase = present ? "installed" : "not_installed";
    }
  }
  async catalog(localBrowser: boolean): Promise<WebAppCatalog> {
    await this.discover();
    const apps = {} as WebAppCatalog["apps"];
    for (const id of WEB_APP_IDS) {
      const entry = this.config.integrations[id];
      const state = this.states[id];
      const status: WebAppStatus = { id, phase: state.phase };
      if (state.detail) status.detail = state.detail;
      const candidate = integrationAccessUrl(this.config, id);
      if (candidate && (localBrowser || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(candidate).hostname))) {
        status.accessUrl = candidate;
      }
      status.canEnsure = entry?.mode === "managed";
      // Bootstrap is an explicit authenticated action, never a catalogue/iframe token.
      status.canAuthorize = Boolean(this.config.auth.enabled && entry?.mode === "managed" && state.launchUrl && status.accessUrl);
      if (state.phase === "running" && !status.accessUrl) status.detail = "independent_access_required";
      apps[id] = status;
    }
    return { apps };
  }
  async authorizationUrl(id: WebAppId, localBrowser: boolean): Promise<string | undefined> {
    if (!this.config.auth.enabled) return undefined;
    const entry = this.config.integrations[id];
    const state = this.states[id];
    if (entry?.mode !== "managed" || state.phase !== "running" || !state.launchUrl) return undefined;
    const url = new URL(state.launchUrl);
    // Never redirect remote clients to loopback or a caller-supplied destination.
    if (localBrowser && !this.config.server.privateGateway) return url.href;
    const destination = new URL(integrationAccessUrl(this.config, id)!);
    if (["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname)) return undefined;
    const privateHarnessHttp = id === "harness" && this.config.server.exposure.mode === "lan" && Boolean(this.config.server.privateGateway);
    if (destination.protocol !== "https:" && !privateHarnessHttp) return undefined;
    destination.search = url.search;
    return destination.href;
  }
  ensure(id: WebAppId): Promise<void> {
    const entry = this.config.integrations[id];
    if (this.closed || entry?.mode !== "managed") return Promise.resolve();
    const state = this.states[id];
    if (state.phase === "running" && state.process?.exitCode === null) return Promise.resolve();
    if (state.ensure) return state.ensure;
    state.ensure = this.prepare(id).catch((error: unknown) => {
      if (!this.closed) { state.phase = "failed"; state.detail = failureDetail(error); }
    }).finally(() => { state.ensure = undefined; });
    return state.ensure;
  }
  private async installHarness(): Promise<string> {
    const prefix = path.join(this.appRoot, "harness");
    if (await isPinnedHarnessPackage(prefix)) return managedHarnessBin(this.appRoot);
    this.states.harness.phase = "installing";
    const npm = await firstExisting(npmCliCandidates());
    if (!npm) throw new Error("npm_unavailable");
    await mkdir(this.appRoot, { recursive: true, mode: 0o700 });
    const staging = await mkdtemp(path.join(this.appRoot, "harness-install-"));
    try {
      let result;
      try {
        result = await runBoundedProcess({
          executable: process.execPath,
          args: [npm, "install", "--prefix", staging, "--no-audit", "--no-fund", "--loglevel=error", "--save=false", `@deepseek-ai/dsh@${HARNESS_PIN}`],
          env: thirdPartyEnvironment(this.config.auth.tokenEnv), owned: true,
          timeoutMs: INSTALL_TIMEOUT_MS, signal: this.installerAbort.signal,
          maxStdoutBytes: MAX_LOG_BYTES, maxStderrBytes: MAX_LOG_BYTES, truncateStdout: true
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("timed out")) throw new Error("install_timeout");
        throw error;
      }
      if (this.closed) throw new Error("closed");
      if (result.code !== 0 || !(await isPinnedHarnessPackage(staging))) throw new Error("install_failed");
      // Both resolved targets are fixed children of our private installation root.
      const resolvedRoot = path.resolve(this.appRoot) + path.sep;
      if (!path.resolve(prefix).startsWith(resolvedRoot) || !path.resolve(staging).startsWith(resolvedRoot)) throw new Error("Invalid install root");
      await rm(prefix, { recursive: true, force: true });
      await rename(staging, prefix);
      return managedHarnessBin(this.appRoot);
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  private async prepare(id: WebAppId): Promise<void> {
    const entry = this.config.integrations[id];
    if (entry?.mode !== "managed" || this.closed) return;
    const state = this.states[id];
    state.detail = undefined;
    await assertFreePort(entry.port);
    const cli = id === "harness" ? await this.installHarness() : await findOfficialVSCodeCli();
    if (!cli) throw new Error("vscode_not_detected");
    if (this.closed) return;
    state.phase = "starting";
    state.launchUrl = undefined;
    let executable = process.execPath;
    let args: string[];
    if (id === "harness") {
      args = [cli, "web", "--host", "127.0.0.1", "--port", String(entry.port), "--no-open"];
      const publicUrl = this.config.server.privateGateway ? integrationAccessUrl(this.config, id) : undefined;
      if (publicUrl) {
        args.push("--public-url", publicUrl, "--trusted-host", new URL(publicUrl).host);
      }
    } else {
      args = ["serve-web", "--host", "127.0.0.1", "--port", String(entry.port)];
      executable = cli;
      if (process.platform === "win32" && cli.toLowerCase().endsWith(".cmd")) {
        executable = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "& '" + cli.replaceAll("'", "''") + "' " + args.join(" ") + "; exit $LASTEXITCODE"];
      }
    }
    const child = spawnOwnedProcess({ executable, args, cwd: os.homedir(), env: thirdPartyEnvironment(this.config.auth.tokenEnv) });
    state.process = child;
    try {
      await new Promise<void>((resolve, reject) => {
        let output = "", settled = false, probing = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clearInterval(probeInterval);
          if (error) reject(error); else resolve();
        };
        const timer = setTimeout(() => finish(new Error("startup_timeout")), STARTUP_TIMEOUT_MS[id]);
        // The official CLI may print its final URL without a newline. Verify
        // token authentication over loopback rather than trusting a partial chunk.
        const probeInterval = setInterval(() => {
          if (id !== "vscodeWeb" || probing || settled) return;
          const candidate = this.parseCodeUrl(output, entry.port);
          if (!candidate) return;
          probing = true;
          void this.verifyCodeReady(candidate).then((ready) => {
            if (ready && !settled) { state.launchUrl = candidate; finish(); }
          }).finally(() => { probing = false; });
        }, 250);
        child.once("error", () => finish(new Error("process_failed")));
        child.once("close", () => {
          if (state.process === child) {
            state.process = undefined; state.launchUrl = undefined;
            if (!this.closed) { state.phase = "failed"; state.detail = "process_exited"; }
          }
          finish(new Error("process_failed"));
        });
        const append = (chunk: Buffer) => {
          output = stripVTControlCharacters(output + chunk.toString("utf8")).slice(-MAX_LOG_BYTES);
          const expected = this.config.server.privateGateway ? new URL(integrationAccessUrl(this.config, id)!).origin : undefined;
          const ready = id === "harness" ? parseHarnessReadyUrl(output, expected) : undefined;
          if (ready) { state.launchUrl = ready; finish(); }
        };
        child.stdout.on("data", append);
        child.stderr.on("data", append);
      });
      if (child.exitCode !== null || child.signalCode !== null || this.closed) throw new Error("process_failed");
      state.phase = "running";
    } catch (error) {
      await stopOwnedProcess(child);
      if (state.process === child) state.process = undefined;
      state.launchUrl = undefined;
      throw error;
    }
  }
  private parseCodeUrl(output: string, port: number): string | undefined {
    for (const match of output.matchAll(/http:\/\/127\.0\.0\.1:\d+[^\s"'<>]*/gu)) {
      const candidate = validatedLaunchUrl(match[0]);
      if (candidate && new URL(candidate).port === String(port)) return candidate;
    }
    return undefined;
  }
  private async verifyCodeReady(candidate: string): Promise<boolean> {
    try {
      const url = new URL(candidate);
      if (!url.searchParams.has("tkn") && !url.searchParams.has("token")) return false;
      const exchange = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1500) });
      const cookie = exchange.headers.get("set-cookie")?.split(";")[0];
      await exchange.body?.cancel();
      if (!cookie) return false;
      const response = await fetch(url.origin + "/", { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(1500) });
      await response.body?.cancel();
      return response.status === 200;
    } catch { return false; }
  }
  async close(): Promise<void> {
    this.closed = true;
    this.installerAbort.abort();
    await Promise.all(WEB_APP_IDS.map(async (id) => {
      const state = this.states[id];
      await stopOwnedProcess(state.process);
      await state.ensure;
      state.process = undefined; state.launchUrl = undefined;
    }));
  }
}
