import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PalmTTYConfig } from "@palmtty/config";
import { runBoundedProcess } from "./bounded-process.js";

export type WebAppId = "vscodeWeb" | "harness";
export type WebAppPhase =
  | "detecting" | "not_installed" | "installed" | "installing"
  | "starting" | "running" | "manual_required" | "failed";
export type WebAppStatus = {
  id: WebAppId;
  phase: WebAppPhase;
  accessUrl?: string;
  detail?: string;
};
export type WebAppCatalog = { apps: Record<WebAppId, WebAppStatus> };

export const HARNESS_PIN = "0.2.1-rc.2";
const MAX_LOG_BYTES = 8192;
const STARTUP_TIMEOUT_MS = 75_000;
const INSTALL_TIMEOUT_MS = 180_000;

async function exists(filename: string): Promise<boolean> {
  try { await access(filename); return true; } catch { return false; }
}

function personalAppRoot(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share"), "PalmTTY", "web-apps");
}

function vscodeCandidates(): string[] {
  if (process.platform === "win32") {
    return [
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "bin", "code.cmd"),
      path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Microsoft VS Code", "bin", "code.cmd"),
      path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft VS Code", "bin", "code.cmd")
    ];
  }
  return ["/usr/local/bin/code", "/usr/bin/code"];
}

function npmCliCandidates(): string[] {
  const base = path.dirname(process.execPath);
  return [
    path.join(base, "node_modules", "npm", "bin", "npm-cli.js"),
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

function managedHarnessBin(root: string): string {
  return path.join(root, "harness", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}

// Never copy PalmTTY's bootstrap token, cookie or control credentials into an
// independently executed third-party program.
function thirdPartyEnvironment(tokenEnv: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.toUpperCase().startsWith("PALMTTY_") || name === tokenEnv) delete env[name];
  }
  return env;
}

function safeError(error: unknown): string {
  // Do not reflect arbitrary upstream stdout/stderr (may contain launch tokens).
  if (error instanceof Error && error.message.includes("timed out")) return "timeout";
  return "process_failed";
}

export class ManagedWebApps {
  private readonly appRoot: string;
  private readonly config: PalmTTYConfig;
  private harnessProcess: ChildProcessWithoutNullStreams | undefined;
  private harnessStartupUrl: string | undefined;
  private activeEnsure: Promise<void> | undefined;
  private harnessPhase: WebAppPhase = "detecting";
  private harnessDetail: string | undefined;
  private closed = false;
  private vscodePresent: boolean | undefined;
  private harnessPresent: boolean | undefined;

  constructor(config: PalmTTYConfig, appRoot = personalAppRoot()) {
    this.config = config;
    this.appRoot = appRoot;
  }

  async discover(): Promise<void> {
    if (this.vscodePresent === undefined) {
      this.vscodePresent = Boolean(await firstExisting(vscodeCandidates()));
    }
    if (this.harnessPresent === undefined) {
      const managed = managedHarnessBin(this.appRoot);
      // A user-installed dsh remains outside PalmTTY ownership. Do not attach
      // to an unknown process or guess an existing service from an open port.
      const globalBins = process.platform === "win32"
        ? [path.join(process.env.APPDATA ?? "", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js")]
        : ["/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js"];
      this.harnessPresent = Boolean(await firstExisting([managed, ...globalBins]));
      if (this.harnessPhase === "detecting") {
        this.harnessPhase = this.harnessPresent ? "installed" : "not_installed";
      }
    }
  }

  async catalog(localBrowser: boolean): Promise<WebAppCatalog> {
    await this.discover();
    const externalVscode = this.config.integrations.vscodeWeb;
    const externalHarness = this.config.integrations.harness;
    const vscode: WebAppStatus = {
      id: "vscodeWeb",
      phase: this.vscodePresent ? "manual_required" : "not_installed",
      detail: this.vscodePresent ? "vscode_server_license" : "vscode_not_detected",
      ...(externalVscode ? { accessUrl: externalVscode } : {})
    };
    const harness: WebAppStatus = {
      id: "harness",
      phase: this.harnessPhase,
      ...(this.harnessDetail ? { detail: this.harnessDetail } : {}),
      ...(externalHarness ? { accessUrl: externalHarness } : (
        localBrowser && this.harnessStartupUrl ? { accessUrl: this.harnessStartupUrl } : {}
      ))
    };
    if (harness.phase === "running" && !harness.accessUrl) {
      harness.detail = "separate_https_origin_required";
    }
    return { apps: { vscodeWeb: vscode, harness } };
  }

  // The official VS Code Server license disallows service hosting; installing
  // or daemonizing it inside the Agent is not an allowed managed-app action.
  ensure(id: WebAppId): Promise<void> {
    if (id === "vscodeWeb") return this.discover();
    if (this.harnessPhase === "running" && this.harnessProcess?.exitCode === null) {
      return Promise.resolve();
    }
    if (this.activeEnsure) return this.activeEnsure;
    this.activeEnsure = this.ensureHarness().finally(() => {
      this.activeEnsure = undefined;
    });
    return this.activeEnsure;
  }

  private async ensureHarness(): Promise<void> {
    await this.discover();
    if (this.closed) return;
    this.harnessDetail = undefined;
    try {
      let cli = managedHarnessBin(this.appRoot);
      if (!(await exists(cli))) {
        const globalCli = process.platform === "win32"
          ? path.join(process.env.APPDATA ?? "", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js")
          : "/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js";
        if (await exists(globalCli)) {
          cli = globalCli;
        } else {
          this.harnessPhase = "installing";
          const npm = await firstExisting(npmCliCandidates());
          if (!npm) {
            this.harnessPhase = "failed";
            this.harnessDetail = "npm_unavailable";
            return;
          }
          const prefix = path.join(this.appRoot, "harness");
          await mkdir(prefix, { recursive: true, mode: 0o700 });
          const result = await runBoundedProcess({
            executable: process.execPath,
            args: [npm, "install", "--prefix", prefix, "--no-audit",
              "--no-fund", "--save=false", `@deepseek-ai/dsh@${HARNESS_PIN}`],
            env: thirdPartyEnvironment(this.config.auth.tokenEnv),
            timeoutMs: INSTALL_TIMEOUT_MS,
            maxStdoutBytes: MAX_LOG_BYTES,
            maxStderrBytes: MAX_LOG_BYTES
          });
          if (result.code !== 0 || !(await exists(cli))) {
            this.harnessPhase = "failed";
            this.harnessDetail = "install_failed";
            return;
          }
        }
      }
      if (!this.closed) await this.startHarness(cli);
    } catch (error) {
      this.harnessPhase = "failed";
      this.harnessDetail = safeError(error);
    }
  }

  private async startHarness(cli: string): Promise<void> {
    this.harnessPhase = "starting";
    this.harnessStartupUrl = undefined;
    const child = spawn(process.execPath,
      [cli, "web", "--host", "127.0.0.1", "--port", "0", "--no-open"],
      {
        cwd: os.homedir(), // Harness owns its own workspace selection.
        env: thirdPartyEnvironment(this.config.auth.tokenEnv),
        shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
      }
    );
    this.harnessProcess = child;
    child.stdin.end();
    let output = "";
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let completed = false;
        const finish = (error?: Error, value?: string) => {
          if (completed) return;
          completed = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value!);
        };
        const timer = setTimeout(
          () => finish(new Error("Startup timed out")), STARTUP_TIMEOUT_MS
        );
        child.on("error", () => finish(new Error("Launch failed")));
        child.on("close", () => finish(new Error("Launch exited")));
        // Upstream prints a one-time process-token URL. Never send this to logs.
        const append = (chunk: Buffer) => {
          output = (output + chunk.toString("utf8")).slice(-MAX_LOG_BYTES);
          const match = /http:\/\/127\.0\.0\.1:\d{2,5}\/[^\s"'<>]*/u.exec(output);
          if (match) finish(undefined, match[0]);
        };
        child.stdout.on("data", append);
        child.stderr.on("data", append);
      });
      const parsed = new URL(url);
      if (parsed.hostname !== "127.0.0.1" || !parsed.port) {
        throw new Error("Unexpected upstream URL");
      }
      this.harnessStartupUrl = url;
      this.harnessPhase = "running";
      this.harnessPresent = true;
      child.once("close", () => {
        if (this.harnessProcess === child) {
          this.harnessProcess = undefined;
          this.harnessStartupUrl = undefined;
          this.harnessPhase = "failed";
          this.harnessDetail = "process_exited";
        }
      });
    } catch (error) {
      if (child.exitCode === null) child.kill();
      if (this.harnessProcess === child) this.harnessProcess = undefined;
      this.harnessStartupUrl = undefined;
      this.harnessPhase = "failed";
      this.harnessDetail = safeError(error);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    // Only stop processes this Agent itself spawned; never kill adopted or
    // discovered installations, VS Code tasks, arbitrary PIDs or port owners.
    if (this.harnessProcess && this.harnessProcess.exitCode === null) {
      this.harnessProcess.kill();
    }
    this.harnessProcess = undefined;
    this.harnessStartupUrl = undefined;
  }
}
