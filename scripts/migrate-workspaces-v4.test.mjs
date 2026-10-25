import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const script = "scripts/migrate-workspaces-v4.mjs";
function invoke(from, to) {
  return spawnSync(process.execPath, [script, "--from", from, "--to", to], {
    encoding: "utf8"
  });
}

test("exports schema-valid v4 with no obsolete app profiles and never overwrites", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "palmtty-migrate-"));
  try {
    const from = path.join(dir, "v3.json");
    const to = path.join(dir, "v4.json");
    const fixture = { version: 3, workspaces: [{
      id: "one", name: "One", cwd: "C:/project",
      terminal: { runtime: { kind: "host", args: [] }, startupCommand: "codex" },
      remoteApps: [{ id: "obsolete" }]
    }] };
    await writeFile(from, JSON.stringify(fixture));
    assert.equal(invoke(from, to).status, 0);
    const result = JSON.parse(await readFile(to, "utf8"));
    assert.equal(result.version, 4);
    assert.equal(result.workspaces[0].terminal.startupCommand, "codex");
    assert.equal("remoteApps" in result.workspaces[0], false);
    const bytesBefore = await readFile(to);
    assert.notEqual(invoke(from, to).status, 0, "refuse overwrite");
    assert.deepEqual(await readFile(to), bytesBefore, "failed migration must not replace v4");
    assert.deepEqual((await readdir(dir)).sort(), ["v3.json", "v4.json"], "no temporary files survive");
    assert.deepEqual(JSON.parse(await readFile(from, "utf8")), fixture);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refuses malformed or duplicate v3 records before writing v4", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "palmtty-migrate-bad-"));
  try {
    const from = path.join(dir, "v3.json");
    const to = path.join(dir, "v4.json");
    const good = {
      id: "one", name: "One", cwd: "C:/project",
      terminal: { runtime: { kind: "host", args: [] } }
    };
    for (const workspaces of [
      [null],
      [{ ...good, terminal: null }],
      [{ ...good, cwd: "" }],
      [good, { ...good, name: "Duplicate" }],
      [{ ...good, environment: { TERM: "unsafe" } }]
    ]) {
      await writeFile(from, JSON.stringify({ version: 3, workspaces }));
      assert.notEqual(invoke(from, to).status, 0);
      await assert.rejects(access(to), { code: "ENOENT" });
      assert.deepEqual((await readdir(dir)).sort(), ["v3.json"]);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
