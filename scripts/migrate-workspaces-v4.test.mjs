import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("exports v4 and preserves v3 without app profiles", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "palmtty-migrate-"));
  try {
    const from = path.join(dir, "v3.json");
    const to = path.join(dir, "v4.json");
    const fixture = { version: 3, workspaces: [{
      id: "one", name: "One", cwd: "C:/project",
      terminal: { runtime: { kind: "host", args: [] }, startupCommand: "codex" },
      remoteApps: [{ id: "removed" }]
    }] };
    await writeFile(from, JSON.stringify(fixture));
    const run = () => spawnSync(process.execPath,
      ["scripts/migrate-workspaces-v4.mjs", "--from", from, "--to", to], { encoding: "utf8" });
    assert.equal(run().status, 0);
    const result = JSON.parse(await readFile(to, "utf8"));
    assert.equal(result.version, 4);
    assert.equal(result.workspaces[0].terminal.startupCommand, "codex");
    assert.equal("remoteApps" in result.workspaces[0], false);
    assert.notEqual(run().status, 0);
    assert.deepEqual(JSON.parse(await readFile(from, "utf8")), fixture);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
