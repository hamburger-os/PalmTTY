#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const pinned = readFileSync(path.join(root, ".node-version"), "utf8").trim();
const parsed = /^(\d+)\.(\d+)\.(\d+)$/.exec(pinned);
if (!parsed) throw new Error(".node-version must contain an exact semantic version");
const [major, minor, patch] = parsed.slice(1).map(Number);
const nodeRange = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).engines?.node;
if (nodeRange !== `>=${pinned} <${major + 1}`) {
  throw new Error("package.json engines.node must match the pinned Node runtime and supported major");
}
const current = /^v(\d+)\.(\d+)\.(\d+)$/.exec(process.version);
if (!current) throw new Error("Unable to parse running Node.js version");
const [actualMajor, actualMinor, actualPatch] = current.slice(1).map(Number);
if (actualMajor !== major || actualMinor < minor ||
    (actualMinor === minor && actualPatch < patch)) {
  throw new Error(`Expected Node >=${pinned} <${major + 1}, running ${process.version}. Use .node-version.`);
}
console.log(`[PalmTTY] runtime checked: ${process.version} (baseline ${pinned})`);
