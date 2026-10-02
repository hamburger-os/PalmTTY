#!/usr/bin/env node
// Diagnostic only. It does not install the planned Machine Service or gateway.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateUnattendedReadiness } from "./unattended-readiness-core.mjs";

function parseArgs(argv) {
  let vmName;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") json = true;
    else if (arg === "--vm" && i + 1 < argv.length && vmName === undefined) {
      vmName = argv[++i];
      if (!vmName || vmName.length > 128 || /[\u0000-\u001f\u007f]/u.test(vmName)) {
        throw new Error("--vm must be a valid 1-128 character Hyper-V VM name");
      }
    } else {
      throw new Error("Usage: pnpm unattended:check -- [--vm <gateway-vm-name>] [--json]");
    }
  }
  return { vmName, json };
}

try {
  const options = parseArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
  if (process.platform !== "win32") {
    throw new Error("This read-only host diagnostic must run on the Windows 11 Pro target PC.");
  }
  const script = fileURLToPath(new URL("./unattended-readiness.ps1", import.meta.url));
  const powershell = path.win32.join(
    process.env.SystemRoot || process.env.WINDIR || "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe"
  );
  const stdout = execFileSync(powershell, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-File", script,
    "-VmName", options.vmName || ""
  ], { encoding: "utf8", timeout: 20000, maxBuffer: 65536, windowsHide: true });
  const report = evaluateUnattendedReadiness(JSON.parse(stdout.trim()), !!options.vmName);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("PalmTTY unattended RDP: read-only host readiness (NOT end-to-end certification)");
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
