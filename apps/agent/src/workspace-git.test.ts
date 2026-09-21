import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import {
  getWorkspaceGitDiff,
  getWorkspaceGitStatus
} from "./workspace-git.js";

const gitAvailable = spawnSync("git", ["--version"], {
  windowsHide: true,
  stdio: "ignore"
}).status === 0;

const roots = new Set<string>();

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    windowsHide: true,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git exited with ${result.status}`);
  }
}

async function definition(): Promise<WorkspaceDefinition> {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-git-test-"));
  roots.add(root);
  return {
    id: "git-test",
    name: "Git test",
    cwd: root,
    runtime: { kind: "host", args: [] }
  };
}

afterEach(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
  roots.clear();
});

describe.skipIf(!gitAvailable)("workspace Git integration", () => {
  it("reports repository status and bounded diffs", async () => {
    const workspace = await definition();
    runGit(workspace.cwd, ["init"]);
    runGit(workspace.cwd, ["config", "user.name", "PalmTTY Test"]);
    runGit(workspace.cwd, ["config", "user.email", "palmtty@example.invalid"]);
    await writeFile(path.join(workspace.cwd, "README.md"), "one\n", "utf8");
    runGit(workspace.cwd, ["add", "--", "README.md"]);
    runGit(workspace.cwd, ["commit", "-m", "initial"]);
    await writeFile(path.join(workspace.cwd, "README.md"), "one\ntwo\n", "utf8");

    const status = await getWorkspaceGitStatus(workspace);
    expect(status.available).toBe(true);
    expect(status.entries).toEqual([
      expect.objectContaining({
        path: "README.md",
        staged: false,
        unstaged: true,
        untracked: false
      })
    ]);

    const diff = await getWorkspaceGitDiff(workspace, "README.md", false);
    expect(diff.staged).toBe(false);
    expect(diff.diff).toContain("+two");
    expect(diff.truncated).toBe(false);
  });

  it("reports a non-repository without treating it as an Agent failure", async () => {
    const workspace = await definition();
    const status = await getWorkspaceGitStatus(workspace);
    expect(status).toMatchObject({
      available: false,
      ahead: 0,
      behind: 0,
      entries: [],
      truncated: false
    });
  });

  it("rejects repository path traversal", async () => {
    const workspace = await definition();
    runGit(workspace.cwd, ["init"]);
    await expect(getWorkspaceGitDiff(workspace, "../outside", false)).rejects.toThrow();
  });
});
