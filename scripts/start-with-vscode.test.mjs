import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_VSCODE_WEB_PORT, filteredVSCodeEnvironment,
  localVSCodeWebPort, officialVSCodeWebArgs, windowsVSCodeCommand
} from "./start-with-vscode.mjs";
import {
  findOfficialVSCodeCli, officialVSCodeCliCandidates, parseConfig
} from "../packages/config/dist/index.js";

test("local loopback configuration is the only launch port source", () => {
  assert.equal(localVSCodeWebPort(parseConfig({})), DEFAULT_VSCODE_WEB_PORT);
  assert.equal(localVSCodeWebPort(parseConfig({
    integrations: { vscodeWeb: "http://127.0.0.1:8800/" }
  })), 8800);
  assert.equal(localVSCodeWebPort(parseConfig({
    integrations: { vscodeWeb: "https://code.example.test/" }
  })), DEFAULT_VSCODE_WEB_PORT);
  assert.throws(() => localVSCodeWebPort(parseConfig({
    integrations: { vscodeWeb: "http://localhost:8000/editor" }
  })));
});

test("official CLI launch is loopback-only and retains token/license prompts", () => {
  assert.deepEqual(officialVSCodeWebArgs(8000), [
    "serve-web", "--host", "127.0.0.1", "--port", "8000"
  ]);
  for (const invalid of [0, 65536, NaN, 1.5, -1]) {
    assert.throws(() => officialVSCodeWebArgs(invalid));
  }
  assert.doesNotMatch(officialVSCodeWebArgs(8000).join(" "), /without-connection-token|accept-server-license-terms/);
});

test("Windows path quoting prevents command injection; secrets cannot cross the boundary", () => {
  const cmd = windowsVSCodeCommand("C:\\My 'special' path\\code.cmd",
    officialVSCodeWebArgs(8000));
  assert.match(cmd, /'C:\\My ''special'' path\\code.cmd'/);
  assert.deepEqual(filteredVSCodeEnvironment({
    PATH: "safe", PALMTTY_ACCESS_TOKEN: "private", myCustomToken: "secret", OTHER: "ok"
  }, "myCustomToken"), { PATH: "safe", OTHER: "ok" });
});

test("shared Windows discovery uses official install locations before PATH", () => {
  const c = officialVSCodeCliCandidates("win32", {
    LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
    PATH: "C:\\Tools"
  }, "C:\\Users\\me");
  assert.equal(c[0], "C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd");
  assert.ok(c.includes("C:\\Tools\\code.cmd"));
  assert.ok(!c.some(p => p.includes("code-server")));
});

test("shared discovery resolves user-installed CLI and does not execute it", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "palmtty-vscode-cli-"));
  try {
    const cli = path.join(dir, "code");
    await writeFile(cli, "#!/bin/sh\\nexit 99\\n", { mode: 0o755 });
    assert.equal(await findOfficialVSCodeCli("linux", { PATH: dir }, "/missing/home"), cli);
    assert.equal(await findOfficialVSCodeCli("linux", { PATH: "" }, "/missing/home"), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("joint launcher refuses background or piped stdin before launching servers", () => {
  const result = spawnSync(process.execPath,
    [new URL("./start-with-vscode.mjs", import.meta.url).pathname], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]
    });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive foreground terminal/);
});
