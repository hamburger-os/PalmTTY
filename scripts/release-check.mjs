#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractReleaseSection,
  isUnreleasedEmpty,
  normalizeVersion
} from "./release-tools.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✅ ${message}`);
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const releaseIndex = args.indexOf("--release");
const releaseMode = releaseIndex >= 0;
const explicitVersion = releaseMode
  ? args[releaseIndex + 1]
  : args.find((arg) => !arg.startsWith("--"));

const rootPackage = readJson("package.json");
let expected;
try {
  expected = normalizeVersion(explicitVersion ?? rootPackage.version);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (rootPackage.version !== expected) {
  fail(`package.json: expected ${expected}, found ${rootPackage.version ?? "<missing>"}`);
} else {
  pass(`package.json is the release version source: ${expected}`);
}

for (const relativePath of [
  "apps/agent/package.json",
  "apps/web/package.json",
  "packages/config/package.json",
  "packages/protocol/package.json"
]) {
  const workspacePackage = readJson(relativePath);
  if (Object.prototype.hasOwnProperty.call(workspacePackage, "version")) {
    fail(
      `${relativePath}: private workspace packages must not define a second version source`
    );
  } else {
    pass(`${relativePath} has no duplicate version field`);
  }
}

if (rootPackage.private !== true) {
  fail("package.json must remain private; PalmTTY releases source, not npm packages");
}

if (rootPackage.license !== "Apache-2.0") {
  fail(`package.json license must remain Apache-2.0, found ${rootPackage.license ?? "<missing>"}`);
}

if (releaseMode) {
  const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
  const releaseSection = extractReleaseSection(changelog, expected);

  if (!releaseSection || releaseSection.length < 20) {
    fail(`CHANGELOG.md: missing or empty release section for ${expected}`);
  } else {
    pass(`CHANGELOG.md documents ${expected}`);
  }

  if (!isUnreleasedEmpty(changelog)) {
    fail(
      "CHANGELOG.md: [Unreleased] must be empty before publishing; move all pending changes into the release section"
    );
  } else {
    pass("CHANGELOG.md [Unreleased] is empty");
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `🎉 Version metadata is consistent for ${expected}${releaseMode ? " and the release metadata is ready" : ""}.`
);
