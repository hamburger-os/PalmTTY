#!/usr/bin/env node
// This tool never installs the gateway, changes Windows policy or reads Windows passwords.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateUnattendedReadiness } from "./unattended-readiness-core.mjs";

try {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.some((arg) => arg !== "--json") || args.filter((arg) => arg === "--json").length > 1) {
    throw new Error("Usage: pnpm unattended:check -- [--json]");
  }
  if (process.platform !== "win32") throw new Error("Run this diagnostic on the target Windows 11 Pro PC.");
  const script = fileURLToPath(new URL("./unattended-readiness.ps1", import.meta.url));
  const root = process.env.SystemRoot || process.env.WINDIR;
  if (!root) throw new Error("Windows SystemRoot is missing");
  const powershell = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const output = execFileSync(powershell,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", script],
    { encoding: "utf8", timeout: 20_000, maxBuffer: 65_536, windowsHide: true });
  const report = evaluateUnattendedReadiness(JSON.parse(output.trim()));
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("PalmTTY Windows-native RDP gateway: host configuration check only");
    console.log(JSON.stringify(report.observed, null, 2));
    for (const message of report.blocking) console.error("BLOCKED: " + message);
    for (const message of report.warnings) console.warn("CHECK: " + message);
    for (const message of report.requiredManualChecks) console.log("MANUAL: " + message);
  }
  if (report.blocking.length) process.exitCode = 1;
} catch (error) {
  console.error("[PalmTTY] " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 2;
}
