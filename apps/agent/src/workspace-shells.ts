import { spawn } from "node:child_process";
import path from "node:path";
import type {
  DetectShellProfilesRequest,
  ShellProfile
} from "@palmtty/protocol";
import { ShellProfilesResponseSchema } from "@palmtty/protocol";
import { readHostEnvironment } from "./host-environment.js";
import { resolveExecutable } from "./workspace-runtime.js";

const MAX_PROBE_OUTPUT_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 5_000;

type Candidate = {
  id: string;
  label: string;
  program: string;
  args?: string[];
};

const WINDOWS_CANDIDATES: Candidate[] = [
  { id: "pwsh", label: "PowerShell 7", program: "pwsh.exe", args: ["-NoLogo"] },
  { id: "windows-powershell", label: "Windows PowerShell", program: "powershell.exe", args: ["-NoLogo"] },
  { id: "cmd", label: "Command Prompt", program: "cmd.exe" },
  { id: "nushell", label: "Nushell", program: "nu.exe" }
];

const UNIX_CANDIDATES: Candidate[] = [
  { id: "bash", label: "Bash", program: "bash" },
  { id: "zsh", label: "Zsh", program: "zsh" },
  { id: "fish", label: "Fish", program: "fish" },
  { id: "nushell", label: "Nushell", program: "nu" },
  { id: "pwsh", label: "PowerShell", program: "pwsh" },
  { id: "sh", label: "POSIX sh", program: "sh" }
];

async function detectHostShellProfiles(): Promise<ShellProfile[]> {
  const environment = await readHostEnvironment();
  const cwd = process.cwd();
  const candidates = process.platform === "win32"
    ? WINDOWS_CANDIDATES
    : UNIX_CANDIDATES;

  const currentShell = process.platform === "win32"
    ? undefined
    : environment.SHELL?.trim();
  let resolvedCurrentShell: string | undefined;
  if (currentShell) {
    try {
      resolvedCurrentShell = await resolveExecutable(currentShell, {
        cwd,
        env: environment
      });
    } catch {
      resolvedCurrentShell = undefined;
    }
  }

  const profiles: Array<ShellProfile & { resolved: string }> = [];
  const seen = new Set<string>();

  if (resolvedCurrentShell) {
    const basename = path.basename(resolvedCurrentShell);
    const known = UNIX_CANDIDATES.find((candidate) => (
      candidate.program === basename ||
      candidate.program === basename.replace(/\.exe$/i, "")
    ));
    profiles.push({
      id: "current",
      label: known ? `${known.label} (default)` : `${basename} (default)`,
      shell: resolvedCurrentShell,
      args: [],
      recommended: true,
      resolved: resolvedCurrentShell
    });
    seen.add(process.platform === "win32"
      ? resolvedCurrentShell.toLowerCase()
      : resolvedCurrentShell);
  }

  for (const candidate of candidates) {
    try {
      const resolved = await resolveExecutable(candidate.program, {
        cwd,
        env: environment
      });
      const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
      if (seen.has(key)) continue;
      seen.add(key);
      profiles.push({
        id: candidate.id,
        label: candidate.label,
        shell: candidate.program,
        args: candidate.args ?? [],
        recommended: false,
        resolved
      });
    } catch {
      // Missing candidates are intentionally omitted.
    }
  }

  if (!profiles.some((profile) => profile.recommended) && profiles.length > 0) {
    const preferred = process.platform === "win32"
      ? profiles.find((profile) => profile.id === "pwsh") ?? profiles[0]
      : profiles[0];
    if (preferred) preferred.recommended = true;
  }

  return ShellProfilesResponseSchema.parse({
    profiles: profiles.map(({ resolved: _resolved, ...profile }) => profile)
  }).profiles;
}

const WSL_SHELL_PROBE = [
  'printf "DEFAULT\\0%s\\0" "${SHELL:-}"',
  'for name in bash zsh fish nu pwsh sh; do',
  '  resolved="$(command -v "$name" 2>/dev/null || true)"',
  '  [ -n "$resolved" ] || continue',
  '  printf "SHELL\\0%s\\0%s\\0" "$name" "$resolved"',
  "done"
].join("\n");

async function runWslShellProbe(
  executable: string,
  distribution: string | undefined,
  environment: Record<string, string>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      ...(distribution ? ["--distribution", distribution] : []),
      "--exec",
      "/bin/sh",
      "-c",
      WSL_SHELL_PROBE
    ], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: environment
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;

    const finish = (error?: Error, output?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output ?? Buffer.alloc(0));
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PROBE_OUTPUT_BYTES) {
        child.kill();
        finish(new Error("WSL shell detection exceeded the output limit"));
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
          `WSL shell detection failed with exit code ${code ?? "unknown"}`
        ));
        return;
      }
      finish(undefined, Buffer.concat(stdout));
    });

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("WSL shell detection timed out"));
    }, PROBE_TIMEOUT_MS);
    timer.unref();
  });
}

function shellLabel(name: string): string {
  switch (name) {
    case "bash": return "Bash";
    case "zsh": return "Zsh";
    case "fish": return "Fish";
    case "nu": return "Nushell";
    case "pwsh": return "PowerShell";
    case "sh": return "POSIX sh";
    default: return name;
  }
}

async function detectWslShellProfiles(
  distribution: string | undefined
): Promise<ShellProfile[]> {
  if (process.platform !== "win32") {
    throw new Error("WSL shell detection is available only on Windows");
  }

  const environment = await readHostEnvironment();
  const executable = await resolveExecutable("wsl.exe", {
    cwd: process.cwd(),
    env: environment
  });
  const output = await runWslShellProbe(executable, distribution, environment);
  const records = output.toString("utf8").split("\0");
  let defaultShell = "";
  const candidates: Array<{ name: string; resolved: string }> = [];

  for (let index = 0; index < records.length;) {
    const type = records[index++];
    if (!type) continue;
    if (type === "DEFAULT") {
      defaultShell = records[index++] ?? "";
      continue;
    }
    if (type === "SHELL") {
      const name = records[index++] ?? "";
      const resolved = records[index++] ?? "";
      if (name && resolved && path.posix.isAbsolute(resolved)) {
        candidates.push({ name, resolved });
      }
      continue;
    }
    throw new Error("WSL shell detection returned an invalid response");
  }

  const seen = new Set<string>();
  const profiles: ShellProfile[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.resolved)) continue;
    seen.add(candidate.resolved);
    profiles.push({
      id: candidate.name === "nu" ? "nushell" : candidate.name,
      label: shellLabel(candidate.name),
      shell: candidate.resolved,
      args: [],
      recommended: defaultShell.length > 0 &&
        path.posix.normalize(candidate.resolved) === path.posix.normalize(defaultShell)
    });
  }

  if (!profiles.some((profile) => profile.recommended) && profiles.length > 0) {
    const bash = profiles.find((profile) => profile.id === "bash");
    (bash ?? profiles[0])!.recommended = true;
  }

  return ShellProfilesResponseSchema.parse({ profiles }).profiles;
}

export async function detectShellProfiles(
  request: DetectShellProfilesRequest
): Promise<ShellProfile[]> {
  return request.kind === "wsl"
    ? detectWslShellProfiles(request.distribution)
    : detectHostShellProfiles();
}
