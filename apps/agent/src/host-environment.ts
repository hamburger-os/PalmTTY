import { spawn } from "node:child_process";
import path from "node:path";

const MAX_ENVIRONMENT_OUTPUT_BYTES = 512 * 1024;
const ENVIRONMENT_QUERY_TIMEOUT_MS = 5_000;

type StringEnvironment = Record<string, string>;

function normalizedEnvironment(
  environment: NodeJS.ProcessEnv | Record<string, string>
): StringEnvironment {
  return Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function findEnvironmentKey(
  environment: StringEnvironment,
  key: string
): string | undefined {
  const canonical = key.toLowerCase();
  return Object.keys(environment).find(
    (candidate) => candidate.toLowerCase() === canonical
  );
}

function environmentValue(
  environment: StringEnvironment,
  key: string
): string | undefined {
  const existing = findEnvironmentKey(environment, key);
  return existing ? environment[existing] : undefined;
}

function setEnvironmentValue(
  environment: StringEnvironment,
  key: string,
  value: string
): void {
  const existing = findEnvironmentKey(environment, key);
  if (existing && existing !== key) delete environment[existing];
  environment[key] = value;
}

function expandEnvironmentValue(
  value: string,
  environment: StringEnvironment,
  activeKey?: string
): string {
  let current = value;
  const active = activeKey?.toLowerCase();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = current.replace(/%([^%]+)%/g, (match, name: string) => {
      if (active && name.toLowerCase() === active) return match;
      return environmentValue(environment, name) ?? match;
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

export function mergeWindowsEnvironment(
  baseline: NodeJS.ProcessEnv | Record<string, string>,
  machine: Record<string, string>,
  user: Record<string, string>
): StringEnvironment {
  const merged = normalizedEnvironment(baseline);

  for (const [key, value] of Object.entries(machine)) {
    if (key.toLowerCase() === "path") continue;
    setEnvironmentValue(merged, key, value);
  }
  for (const [key, value] of Object.entries(user)) {
    if (key.toLowerCase() === "path") continue;
    setEnvironmentValue(merged, key, value);
  }

  const machinePathRaw = environmentValue(machine, "Path") ?? "";
  const userPathRaw = environmentValue(user, "Path") ?? "";
  const machinePath = expandEnvironmentValue(machinePathRaw, merged, "path");

  const pathExpansionEnvironment = { ...merged };
  if (machinePath) setEnvironmentValue(pathExpansionEnvironment, "Path", machinePath);
  const userPath = expandEnvironmentValue(userPathRaw, pathExpansionEnvironment);
  const userReferencesPath = /%path%/i.test(userPathRaw);
  const freshPath = userReferencesPath
    ? userPath
    : [machinePath, userPath].filter(Boolean).join(";");
  if (freshPath) setEnvironmentValue(merged, "Path", freshPath);

  for (const key of Object.keys(merged)) {
    if (key.toLowerCase() === "path") continue;
    merged[key] = expandEnvironmentValue(merged[key] ?? "", merged, key);
  }
  return merged;
}

const POWERSHELL_ENVIRONMENT_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$machine = [Environment]::GetEnvironmentVariables('Machine')
$user = [Environment]::GetEnvironmentVariables('User')
$result = [ordered]@{ machine = [ordered]@{}; user = [ordered]@{} }
foreach ($key in $machine.Keys) { $result.machine[[string]$key] = [string]$machine[$key] }
foreach ($key in $user.Keys) { $result.user[[string]$key] = [string]$user[$key] }
[Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 4))
`.trim();

function encodedPowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

async function queryWindowsEnvironment(): Promise<{
  machine: Record<string, string>;
  user: Record<string, string>;
}> {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  const executable = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );

  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedPowerShellCommand(POWERSHELL_ENVIRONMENT_SCRIPT)
    ], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;

    const finish = (error?: Error, value?: {
      machine: Record<string, string>;
      user: Record<string, string>;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? { machine: {}, user: {} });
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_ENVIRONMENT_OUTPUT_BYTES) {
        child.kill();
        finish(new Error("Windows environment query exceeded the output limit"));
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
          `Windows environment query failed with exit code ${code ?? "unknown"}`
        ));
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString("utf8")) as {
          machine?: unknown;
          user?: unknown;
        };
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !parsed.machine ||
          typeof parsed.machine !== "object" ||
          !parsed.user ||
          typeof parsed.user !== "object"
        ) {
          throw new Error("Windows environment query returned an invalid document");
        }
        finish(undefined, {
          machine: normalizedEnvironment(parsed.machine as Record<string, string>),
          user: normalizedEnvironment(parsed.user as Record<string, string>)
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Windows environment query timed out"));
    }, ENVIRONMENT_QUERY_TIMEOUT_MS);
    timer.unref();
  });
}

export async function readHostEnvironment(): Promise<StringEnvironment> {
  const baseline = normalizedEnvironment(process.env);
  if (process.platform !== "win32") return baseline;

  try {
    const fresh = await queryWindowsEnvironment();
    return mergeWindowsEnvironment(baseline, fresh.machine, fresh.user);
  } catch {
    // A fresh registry snapshot is an enhancement over the Agent environment,
    // not a reason to make every workspace unusable if Windows PowerShell is
    // unexpectedly unavailable.
    return baseline;
  }
}

export function applyEnvironmentOverrides(
  environment: Record<string, string>,
  overrides: Record<string, string>
): StringEnvironment {
  const result = normalizedEnvironment(environment);
  for (const [key, value] of Object.entries(overrides)) {
    if (process.platform === "win32") {
      setEnvironmentValue(result, key, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function addWslEnvironmentForwarding(
  environment: Record<string, string>,
  names: string[]
): StringEnvironment {
  const result = normalizedEnvironment(environment);
  if (names.length === 0) return result;

  const existing = environmentValue(result, "WSLENV") ?? "";
  const entries = existing.split(":").filter(Boolean);
  const seen = new Set(
    entries.map((entry) => entry.split("/", 1)[0]?.toLowerCase())
  );
  for (const name of names) {
    if (seen.has(name.toLowerCase())) continue;
    entries.push(name);
    seen.add(name.toLowerCase());
  }
  setEnvironmentValue(result, "WSLENV", entries.join(":"));
  return result;
}

export function withoutEnvironmentKeys(
  environment: Record<string, string>,
  keys: string[]
): StringEnvironment {
  const result = normalizedEnvironment(environment);
  for (const key of keys) {
    if (process.platform !== "win32") {
      delete result[key];
      continue;
    }
    const existing = findEnvironmentKey(result, key);
    if (existing) delete result[existing];
  }
  return result;
}
