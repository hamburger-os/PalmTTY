import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("runtime target is one Node 24 LTS major with a pinned security baseline", () => {
  const pinned = readFileSync(".node-version", "utf8").trim();
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(pinned, /^24\.\d+\.\d+$/);
  assert.equal(manifest.engines.node, `>=${pinned} <25`);
  assert.match(manifest.devDependencies["@types/node"], /^\^24\./);
  const run = spawnSync(process.execPath, ["scripts/node-runtime-check.mjs"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});
