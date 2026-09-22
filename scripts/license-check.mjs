#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectLicenseReport } from "./release-tools.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  command,
  ["licenses", "list", "--prod", "--recursive", "--json"],
  {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env
  }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  process.stderr.write(result.stderr ?? "");
  throw new Error(
    `Could not parse pnpm production license report: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

const summary = inspectLicenseReport(report);
console.log(
  `Production dependency license review passed for ${summary.packageCount} package records.`
);
console.log(`Reviewed license expressions: ${summary.licenses.join(", ")}`);
