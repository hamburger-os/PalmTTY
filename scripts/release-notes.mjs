#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractReleaseSection,
  normalizeVersion
} from "./release-tools.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
);
const version = normalizeVersion(process.argv[2] ?? packageJson.version);
const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const body = extractReleaseSection(changelog, version);

if (!body || body.length < 20) {
  throw new Error(`CHANGELOG.md has no usable release section for ${version}`);
}

process.stdout.write(`${body}\n`);
