import { spawn } from "node:child_process";
import path from "node:path";
import type { TerminalProfile } from "@palmtty/protocol";
import { TerminalProfilesResponseSchema } from "@palmtty/protocol";
import { readHostEnvironment } from "./host-environment.js";
import { resolveExecutable } from "./workspace-runtime.js";

const MAX_PROFILE_OUTPUT_BYTES = 64 * 1024;
const PROFILE_PROBE_TIMEOUT_MS = 5_000;

type HostCandidate = {
  id: string;
  label: string;
  program: string;
  args?: string[];
};

const WINDOWS_HOST_CANDIDATES: HostCandidate[] = [
  { id: "pwsh", label: "PowerShell 7", program: "pwsh.exe", args: ["-NoLogo"] },
  { id: "windows-powershell", label: "Windows PowerShell", program: "powershell.exe", args: ["-NoLogo"] },
  { id: "cmd", label: "Command Prompt", program: "cmd.exe" },
  { id: "nushell", label: "Nushell", program: "nu.exe" }
];

const UNIX_HOST_CANDIDATES: HostCandidate[] = [
  { id: "bash", label: "Bash", program: "bash" },
  { id: "zsh", label: "Zsh", program: "zsh" },
  { id: "fish", label: "Fish", program: "fish" },
  { id: "nushell", label: "Nushell", program: "nu" },
  { id: "pwsh", label: "PowerShell", program: "pwsh" },
  { id: "sh", label: "POSIX sh", program: "sh" }
];

function canonicalExecutable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function detectHostProfiles(
  environment: Record<string, string>
): Promise<TerminalProfile[]> {
  const cwd = process.cwd();
  const candidates = process.platform === "win32"
    ? WINDOWS_HOST_CANDIDATES
    : UNIX_HOST_CANDIDATES;
  const profiles: Array<TerminalProfile & { resolved: string }> = [];
  const seen = new Set<string>();

  if (process.platform !== "win32") {
    const currentShell = environment.SHELL?.trim();
    if (currentShell) {
      try {
        const resolved = await resolveExecutable(currentShell, {
          cwd,
          env: environment
        });
        const basename = path.basename(resolved);
        const known = UNIX_HOST_CANDIDATES.find((candidate) => (
          candidate.program === basename ||
          candidate.program === basename.replace(/\.exe$/i, "")
        ));
        profiles.push({
          id: "host:current",
          label: known ? `${known.label} (default)` : `${basename} (default)`,
          runtime: {
            kind: "host",
            shell: resolved,
            args: []
          },
          recommended: true,
          resolved
        });
        seen.add(canonicalExecutable(resolved));
      } catch {
        // Fall through to the known candidate list.
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const resolved = await resolveExecutable(candidate.program, {
        cwd,
        env: environment
      });
      const key = canonicalExecutable(resolved);
      if (seen.has(key)) continue;
      seen.add(key);
      profiles.push({
        id: `host:${candidate.id}`,
        label: candidate.label,
        runtime: {
          kind: "host",
          shell: candidate.program,
          args: candidate.args ?? []
        },
        recommended: false,
        resolved
      });
    } catch {
      // Missing candidates are intentionally omitted.
    }
  }

  if (!profiles.some((profile) => profile.recommended) && profiles.length > 0) {
    const preferred = process.platform === "win32"
      ? profiles.find((profile) => profile.id === "host:pwsh") ?? profiles[0]
      : profiles[0];
    if (preferred) preferred.recommended = true;
  }

  return profiles.map(({ resolved: _resolved, ...profile }) => profile);
}

export function decodeWindowsCommandOutput(output: Buffer): string {
  if (output.length >= 2 && output[0] === 0xff && output[1] === 0xfe) {
    return output.subarray(2).toString("utf16le");
  }

  const pairs = Math.min(Math.floor(output.length / 2), 512);
  if (pairs > 0) {
    let oddNuls = 0;
    for (let index = 0; index < pairs; index += 1) {
      if (output[index * 2 + 1] === 0) oddNuls += 1;
    }
    if (oddNuls / pairs >= 0.3) {
      return output.toString("utf16le");
    }
  }

  return output.toString("utf8");
}

export function parseWslDistributionList(output: string): string[] {
  const seen = new Set<string>();
  const distributions: string[] = [];

  for (const rawLine of output.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const name = rawLine
      .replace(/\0/g, "")
      .replace(/^\s*\*\s*/, "")
      .trim();
    if (!name) continue;

    const canonical = name.toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    distributions.push(name);
  }

  return distributions;
}

async function runCapturedProcess(
  executable: string,
  args: string[],
  environment: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: environment
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;

    const finish = (error?: Error, value?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? Buffer.alloc(0));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PROFILE_OUTPUT_BYTES) {
        child.kill();
        finish(new Error("Terminal profile discovery exceeded the output limit"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 8192) stderr += chunk.slice(0, 8192 - stderr.length);
    });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(
          stderr.trim() ||
          `Terminal profile discovery failed with exit code ${code ?? "unknown"}`
        ));
        return;
      }
      finish(undefined, Buffer.concat(stdout));
    });

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Terminal profile discovery timed out"));
    }, PROFILE_PROBE_TIMEOUT_MS);
    timer.unref();
  });
}

async function detectWslProfiles(
  environment: Record<string, string>
): Promise<TerminalProfile[]> {
  if (process.platform !== "win32") return [];

  const executable = await resolveExecutable("wsl.exe", {
    cwd: process.cwd(),
    env: environment
  });
  const output = await runCapturedProcess(
    executable,
    ["--list", "--quiet"],
    environment
  );
  const distributions = parseWslDistributionList(
    decodeWindowsCommandOutput(output)
  );

  return distributions.map((distribution) => ({
    id: `wsl:${distribution}`,
    label: distribution,
    runtime: {
      kind: "wsl" as const,
      distribution,
      args: []
    },
    recommended: false
  }));
}

export async function detectTerminalProfiles(): Promise<TerminalProfile[]> {
  const environment = await readHostEnvironment();
  const hostProfiles = await detectHostProfiles(environment);

  let wslProfiles: TerminalProfile[] = [];
  if (process.platform === "win32") {
    try {
      wslProfiles = await detectWslProfiles(environment);
    } catch {
      // Host profiles remain useful if WSL enumeration is unavailable.
    }
  }

  const profiles = [...hostProfiles, ...wslProfiles];
  if (!profiles.some((profile) => profile.recommended) && profiles.length > 0) {
    profiles[0]!.recommended = true;
  }

  return TerminalProfilesResponseSchema.parse({ profiles }).profiles;
}
