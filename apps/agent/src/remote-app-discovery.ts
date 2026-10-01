import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  RemoteAppCatalogResponseSchema,
  type RemoteAppCatalogEntry
} from "@palmtty/protocol";
import { resolveExecutable } from "./workspace-runtime.js";

const MAX_DISCOVERY_RESULTS = 64;
const MAX_DISCOVERY_OUTPUT_BYTES = 128 * 1024;
const DISCOVERY_TIMEOUT_MS = 8000;

type KnownApplication = {
  name: string;
  programs: readonly string[];
  relativePaths: readonly string[];
};

const KNOWN_APPLICATIONS: readonly KnownApplication[] = [
  {
    name: "Visual Studio Code",
    programs: ["Code.exe"],
    relativePaths: [
      "Programs/Microsoft VS Code/Code.exe",
      "Microsoft VS Code/Code.exe"
    ]
  },
  {
    name: "Codex Desktop",
    programs: ["Codex.exe"],
    relativePaths: ["Programs/Codex/Codex.exe", "Codex/Codex.exe"]
  },
  {
    name: "ChatGPT",
    programs: ["ChatGPT.exe"],
    relativePaths: [
      "Programs/ChatGPT/ChatGPT.exe",
      "Microsoft/WindowsApps/ChatGPT.exe"
    ]
  },
  {
    name: "Antigravity",
    programs: ["Antigravity IDE.exe", "antigravity.exe"],
    relativePaths: [
      "Programs/Antigravity/Antigravity IDE.exe",
      "Antigravity/Antigravity IDE.exe"
    ]
  }
];

// This script only reads existing registry entries and Start Menu shortcut
// targets. It neither executes discovered applications nor scans whole drives.
// Limit both the shell's work and Node's accepted output.
const WINDOWS_DISCOVERY_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
  "$results = [System.Collections.Generic.List[object]]::new()",
  "$seen = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)",
  "function Add-App([string]$name, [string]$candidate) {",
  "  if ($results.Count -ge 64 -or [string]::IsNullOrWhiteSpace($name) -or",
  "      [string]::IsNullOrWhiteSpace($candidate)) { return }",
  "  $candidate = [Environment]::ExpandEnvironmentVariables($candidate.Trim().Trim('\"'))",
  "  if ($candidate -notmatch '^[A-Za-z]:\\\\' -or",
  "      [IO.Path]::GetExtension($candidate) -ine '.exe' -or",
  "      $candidate -match '(?i)\\\\WindowsApps\\\\' -and $candidate -notmatch '(?i)\\\\Microsoft\\\\WindowsApps\\\\') { return }",
  "  if ($name -match '(?i)uninstall|uninstaller|^setup
  "  if (-not [IO.File]::Exists($candidate)) { return }",
  "  $full = [IO.Path]::GetFullPath($candidate)",
  "  if ($seen.Add($full)) {",
  "    $results.Add(@{ name = $name.Substring(0, [Math]::Min(100, $name.Length));",
  "      executable = $full; source = 'detected' })",
  "  }",
  "}",
  "$keys = @(",
  "  'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',",
  "  'Registry::HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',",
  "  'Registry::HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths'",
  ")",
  "foreach ($root in $keys) {",
  "  if (-not (Test-Path -LiteralPath $root)) { continue }",
  "  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |",
  "    Select-Object -First 128 | ForEach-Object {",
  "      if ($results.Count -ge 64) { return }",
  "      try {",
  "        $target = [string]$_.GetValue('')",
  "        Add-App ([IO.Path]::GetFileNameWithoutExtension($_.PSChildName)) $target",
  "      } catch {}",
  "    }",
  "}",
  "$menus = @(",
  "  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),",
  "  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')",
  ")",
  "try { $shell = New-Object -ComObject WScript.Shell } catch { $shell = $null }",
  "foreach ($menu in $menus) {",
  "  if (-not $shell -or -not (Test-Path -LiteralPath $menu)) { continue }",
  "  Get-ChildItem -LiteralPath $menu -Filter '*.lnk' -Recurse -File -ErrorAction SilentlyContinue |",
  "    Select-Object -First 128 | ForEach-Object {",
  "      if ($results.Count -ge 64) { return }",
  "      try {",
  "        $link = $shell.CreateShortcut($_.FullName)",
  "        Add-App $_.BaseName $link.TargetPath",
  "      } catch {}",
  "    }",
  "}",
  "[Console]::Out.Write(($results.ToArray() | ConvertTo-Json -Compress -Depth 4))"
].join("\n");

function envValue(env: Record<string, string>, name: string): string | undefined {
  return Object.entries(env).find(([key]) =>
    key.toLowerCase() === name.toLowerCase()
  )?.[1];
}

export function knownAppCandidates(
  env: Record<string, string>
): Array<{ name: string; programs: readonly string[]; paths: string[] }> {
  const local = envValue(env, "LOCALAPPDATA");
  const programFiles = envValue(env, "ProgramFiles");
  const programFilesX86 = envValue(env, "ProgramFiles(x86)");
  const roots = [local, programFiles, programFilesX86].filter(
    (value): value is string => Boolean(value)
  );
  return KNOWN_APPLICATIONS.map((app) => ({
    name: app.name,
    programs: app.programs,
    paths: roots.flatMap((root) =>
      app.relativePaths.map((relative) =>
        path.win32.join(root, ...relative.split("/"))
      )
    )
  }));
}

export function parseInstalledAppDiscovery(value: unknown): RemoteAppCatalogEntry[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  const result: RemoteAppCatalogEntry[] = [];
  for (const entry of entries.slice(0, 256)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.name !== "string" ||
      typeof record.executable !== "string" ||
      record.name.trim().length === 0 ||
      !/^[A-Za-z]:\\/.test(record.executable) ||
      path.win32.extname(record.executable).toLowerCase() !== ".exe" ||
      record.executable.length > 4096
    ) continue;
    const key = path.win32.normalize(record.executable).toLowerCase();
    if (seen.has(key) || result.length >= MAX_DISCOVERY_RESULTS) continue;
    seen.add(key);
    result.push({
      name: record.name.trim().slice(0, 100),
      executable: record.executable,
      source: "detected"
    });
  }
  return RemoteAppCatalogResponseSchema.parse({ apps: result }).apps;
}

async function queryInstalledApps(
  env: Record<string, string>
): Promise<RemoteAppCatalogEntry[]> {
  const systemRoot = envValue(env, "SystemRoot") ?? envValue(env, "WINDIR");
  if (!systemRoot) return [];
  const powershell = path.win32.join(
    systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
  );
  return new Promise((resolve) => {
    const child = spawn(powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(WINDOWS_DISCOVERY_SCRIPT, "utf16le").toString("base64")
    ], {
      env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (entries: RemoteAppCatalogEntry[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(entries);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_DISCOVERY_OUTPUT_BYTES) {
        child.kill();
        finish([]);
      } else {
        chunks.push(chunk);
      }
    });
    child.once("error", () => finish([]));
    child.once("close", (code) => {
      if (settled || code !== 0 || bytes === 0) return finish([]);
      try {
        finish(parseInstalledAppDiscovery(
          JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, ""))
        ));
      } catch {
        finish([]);
      }
    });
    const timer = setTimeout(() => {
      child.kill();
      finish([]);
    }, DISCOVERY_TIMEOUT_MS);
    timer.unref();
  });
}

export async function discoverRemoteApps(
  environment: Record<string, string>
): Promise<RemoteAppCatalogEntry[]> {
  const results: RemoteAppCatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: RemoteAppCatalogEntry) => {
    const key = path.win32.normalize(entry.executable).toLowerCase();
    if (!seen.has(key) && results.length < MAX_DISCOVERY_RESULTS) {
      seen.add(key);
      results.push(entry);
    }
  };

  // Resolve well-known apps before the generic catalog, so a large Start
  // Menu cannot crowd out the most useful default selections.
  for (const candidate of knownAppCandidates(environment)) {
    let resolved: string | undefined;
    for (const program of candidate.programs) {
      try {
        resolved = await resolveExecutable(program, {
          cwd: os.homedir(), env: environment
        });
        break;
      } catch { /* Not on PATH. */ }
    }
    if (!resolved) {
      for (const file of candidate.paths) {
        try {
          if (!(await stat(file)).isFile()) continue;
          resolved = await realpath(file);
          break;
        } catch { /* Not installed at this location. */ }
      }
    }
    if (resolved) add({
      name: candidate.name, executable: resolved, source: "detected"
    });
  }
  for (const entry of await queryInstalledApps(environment)) add(entry);

  return RemoteAppCatalogResponseSchema.parse({ apps: results }).apps;
}
 -or",
  "      [IO.Path]::GetFileName($candidate) -match '^(?i:Update|Setup|Uninstall|Uninstaller|Installer)\\.exe
  "  if (-not [IO.File]::Exists($candidate)) { return }",
  "  $full = [IO.Path]::GetFullPath($candidate)",
  "  if ($seen.Add($full)) {",
  "    $results.Add(@{ name = $name.Substring(0, [Math]::Min(100, $name.Length));",
  "      executable = $full; source = 'detected' })",
  "  }",
  "}",
  "$keys = @(",
  "  'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',",
  "  'Registry::HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',",
  "  'Registry::HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths'",
  ")",
  "foreach ($root in $keys) {",
  "  if (-not (Test-Path -LiteralPath $root)) { continue }",
  "  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |",
  "    Select-Object -First 128 | ForEach-Object {",
  "      if ($results.Count -ge 64) { return }",
  "      try {",
  "        $target = [string]$_.GetValue('')",
  "        Add-App ([IO.Path]::GetFileNameWithoutExtension($_.PSChildName)) $target",
  "      } catch {}",
  "    }",
  "}",
  "$menus = @(",
  "  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),",
  "  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')",
  ")",
  "$shell = New-Object -ComObject WScript.Shell",
  "foreach ($menu in $menus) {",
  "  if (-not (Test-Path -LiteralPath $menu)) { continue }",
  "  Get-ChildItem -LiteralPath $menu -Filter '*.lnk' -Recurse -File -ErrorAction SilentlyContinue |",
  "    Select-Object -First 128 | ForEach-Object {",
  "      if ($results.Count -ge 64) { return }",
  "      try {",
  "        $link = $shell.CreateShortcut($_.FullName)",
  "        Add-App $_.BaseName $link.TargetPath",
  "      } catch {}",
  "    }",
  "}",
  "[Console]::Out.Write(($results.ToArray() | ConvertTo-Json -Compress -Depth 4))"
].join("\n");

function envValue(env: Record<string, string>, name: string): string | undefined {
  return Object.entries(env).find(([key]) =>
    key.toLowerCase() === name.toLowerCase()
  )?.[1];
}

export function knownAppCandidates(
  env: Record<string, string>
): Array<{ name: string; programs: readonly string[]; paths: string[] }> {
  const local = envValue(env, "LOCALAPPDATA");
  const programFiles = envValue(env, "ProgramFiles");
  const programFilesX86 = envValue(env, "ProgramFiles(x86)");
  const roots = [local, programFiles, programFilesX86].filter(
    (value): value is string => Boolean(value)
  );
  return KNOWN_APPLICATIONS.map((app) => ({
    name: app.name,
    programs: app.programs,
    paths: roots.flatMap((root) =>
      app.relativePaths.map((relative) =>
        path.win32.join(root, ...relative.split("/"))
      )
    )
  }));
}

export function parseInstalledAppDiscovery(value: unknown): RemoteAppCatalogEntry[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  const result: RemoteAppCatalogEntry[] = [];
  for (const entry of entries.slice(0, 256)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.name !== "string" ||
      typeof record.executable !== "string" ||
      record.name.trim().length === 0 ||
      !/^[A-Za-z]:\\/.test(record.executable) ||
      path.win32.extname(record.executable).toLowerCase() !== ".exe" ||
      record.executable.length > 4096
    ) continue;
    const key = path.win32.normalize(record.executable).toLowerCase();
    if (seen.has(key) || result.length >= MAX_DISCOVERY_RESULTS) continue;
    seen.add(key);
    result.push({
      name: record.name.trim().slice(0, 100),
      executable: record.executable,
      source: "detected"
    });
  }
  return RemoteAppCatalogResponseSchema.parse({ apps: result }).apps;
}

async function queryInstalledApps(
  env: Record<string, string>
): Promise<RemoteAppCatalogEntry[]> {
  const systemRoot = envValue(env, "SystemRoot") ?? envValue(env, "WINDIR");
  if (!systemRoot) return [];
  const powershell = path.win32.join(
    systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
  );
  return new Promise((resolve) => {
    const child = spawn(powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(WINDOWS_DISCOVERY_SCRIPT, "utf16le").toString("base64")
    ], {
      env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (entries: RemoteAppCatalogEntry[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(entries);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_DISCOVERY_OUTPUT_BYTES) {
        child.kill();
        finish([]);
      } else {
        chunks.push(chunk);
      }
    });
    child.once("error", () => finish([]));
    child.once("close", (code) => {
      if (settled || code !== 0 || bytes === 0) return finish([]);
      try {
        finish(parseInstalledAppDiscovery(
          JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, ""))
        ));
      } catch {
        finish([]);
      }
    });
    const timer = setTimeout(() => {
      child.kill();
      finish([]);
    }, DISCOVERY_TIMEOUT_MS);
    timer.unref();
  });
}

export async function discoverRemoteApps(
  environment: Record<string, string>
): Promise<RemoteAppCatalogEntry[]> {
  const results: RemoteAppCatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: RemoteAppCatalogEntry) => {
    const key = path.win32.normalize(entry.executable).toLowerCase();
    if (!seen.has(key) && results.length < MAX_DISCOVERY_RESULTS) {
      seen.add(key);
      results.push(entry);
    }
  };

  // Resolve well-known apps before the generic catalog, so a large Start
  // Menu cannot crowd out the most useful default selections.
  for (const candidate of knownAppCandidates(environment)) {
    let resolved: string | undefined;
    for (const program of candidate.programs) {
      try {
        resolved = await resolveExecutable(program, {
          cwd: os.homedir(), env: environment
        });
        break;
      } catch { /* Not on PATH. */ }
    }
    if (!resolved) {
      for (const file of candidate.paths) {
        try {
          if (!(await stat(file)).isFile()) continue;
          resolved = await realpath(file);
          break;
        } catch { /* Not installed at this location. */ }
      }
    }
    if (resolved) add({
      name: candidate.name, executable: resolved, source: "detected"
    });
  }
  for (const entry of await queryInstalledApps(environment)) add(entry);

  return RemoteAppCatalogResponseSchema.parse({ apps: results }).apps;
}
) { return }",
  "  if (-not [IO.File]::Exists($candidate)) { return }",
  "  $full = [IO.Path]::GetFullPath($candidate)",
  "  if ($seen.Add($full)) {",
  "    $results.Add(@{ name = $name.Substring(0, [Math]::Min(100, $name.Length));",
  "      executable = $full; source = 'detected' })",
  "  }",
  "}",
  "$keys = @(",
  "  'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',",
  "  'Registry::HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths',",
  "  'Registry::HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths'",
  ")",
  "foreach ($root in $keys) {",
  "  if (-not (Test-Path -LiteralPath $root)) { continue }",
  "  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |",
  "    Select-Object -First 128 | ForEach-Object {",
  "      if ($results.Count -ge 64) { return }",
  "      try {",
  "        $target = [string]$_.GetValue('')",
  "        Add-App ([IO.Path]::GetFileNameWithoutExtension($_.PSChildName)) $target",
  "      } catch {}",
  "    }",
  "}",
  "$menus = @(",
  "  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),",
  "  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')",
  ")",
  "$shell = New-Object -ComObject WScript.Shell",
  "foreach ($menu in $menus) {",
  "  if (-not (Test-Path -LiteralPath $menu)) { continue }",
  "  Get-ChildItem -LiteralPath $menu -Filter '*.lnk' -Recurse -File -ErrorAction SilentlyContinue |",
  "    Select-Object -First 128 | ForEach-Object {",
  "      if ($results.Count -ge 64) { return }",
  "      try {",
  "        $link = $shell.CreateShortcut($_.FullName)",
  "        Add-App $_.BaseName $link.TargetPath",
  "      } catch {}",
  "    }",
  "}",
  "[Console]::Out.Write(($results.ToArray() | ConvertTo-Json -Compress -Depth 4))"
].join("\n");

function envValue(env: Record<string, string>, name: string): string | undefined {
  return Object.entries(env).find(([key]) =>
    key.toLowerCase() === name.toLowerCase()
  )?.[1];
}

export function knownAppCandidates(
  env: Record<string, string>
): Array<{ name: string; programs: readonly string[]; paths: string[] }> {
  const local = envValue(env, "LOCALAPPDATA");
  const programFiles = envValue(env, "ProgramFiles");
  const programFilesX86 = envValue(env, "ProgramFiles(x86)");
  const roots = [local, programFiles, programFilesX86].filter(
    (value): value is string => Boolean(value)
  );
  return KNOWN_APPLICATIONS.map((app) => ({
    name: app.name,
    programs: app.programs,
    paths: roots.flatMap((root) =>
      app.relativePaths.map((relative) =>
        path.win32.join(root, ...relative.split("/"))
      )
    )
  }));
}

export function parseInstalledAppDiscovery(value: unknown): RemoteAppCatalogEntry[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  const result: RemoteAppCatalogEntry[] = [];
  for (const entry of entries.slice(0, 256)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.name !== "string" ||
      typeof record.executable !== "string" ||
      record.name.trim().length === 0 ||
      !/^[A-Za-z]:\\/.test(record.executable) ||
      path.win32.extname(record.executable).toLowerCase() !== ".exe" ||
      record.executable.length > 4096
    ) continue;
    const key = path.win32.normalize(record.executable).toLowerCase();
    if (seen.has(key) || result.length >= MAX_DISCOVERY_RESULTS) continue;
    seen.add(key);
    result.push({
      name: record.name.trim().slice(0, 100),
      executable: record.executable,
      source: "detected"
    });
  }
  return RemoteAppCatalogResponseSchema.parse({ apps: result }).apps;
}

async function queryInstalledApps(
  env: Record<string, string>
): Promise<RemoteAppCatalogEntry[]> {
  const systemRoot = envValue(env, "SystemRoot") ?? envValue(env, "WINDIR");
  if (!systemRoot) return [];
  const powershell = path.win32.join(
    systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
  );
  return new Promise((resolve) => {
    const child = spawn(powershell, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(WINDOWS_DISCOVERY_SCRIPT, "utf16le").toString("base64")
    ], {
      env,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (entries: RemoteAppCatalogEntry[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(entries);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_DISCOVERY_OUTPUT_BYTES) {
        child.kill();
        finish([]);
      } else {
        chunks.push(chunk);
      }
    });
    child.once("error", () => finish([]));
    child.once("close", (code) => {
      if (settled || code !== 0 || bytes === 0) return finish([]);
      try {
        finish(parseInstalledAppDiscovery(
          JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, ""))
        ));
      } catch {
        finish([]);
      }
    });
    const timer = setTimeout(() => {
      child.kill();
      finish([]);
    }, DISCOVERY_TIMEOUT_MS);
    timer.unref();
  });
}

export async function discoverRemoteApps(
  environment: Record<string, string>
): Promise<RemoteAppCatalogEntry[]> {
  const results: RemoteAppCatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: RemoteAppCatalogEntry) => {
    const key = path.win32.normalize(entry.executable).toLowerCase();
    if (!seen.has(key) && results.length < MAX_DISCOVERY_RESULTS) {
      seen.add(key);
      results.push(entry);
    }
  };

  // Resolve well-known apps before the generic catalog, so a large Start
  // Menu cannot crowd out the most useful default selections.
  for (const candidate of knownAppCandidates(environment)) {
    let resolved: string | undefined;
    for (const program of candidate.programs) {
      try {
        resolved = await resolveExecutable(program, {
          cwd: os.homedir(), env: environment
        });
        break;
      } catch { /* Not on PATH. */ }
    }
    if (!resolved) {
      for (const file of candidate.paths) {
        try {
          if (!(await stat(file)).isFile()) continue;
          resolved = await realpath(file);
          break;
        } catch { /* Not installed at this location. */ }
      }
    }
    if (resolved) add({
      name: candidate.name, executable: resolved, source: "detected"
    });
  }
  for (const entry of await queryInstalledApps(environment)) add(entry);

  return RemoteAppCatalogResponseSchema.parse({ apps: results }).apps;
}
