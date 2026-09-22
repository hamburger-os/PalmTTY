import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import {
  getWorkspaceGitBranches,
  getWorkspaceGitDiff,
  getWorkspaceGitHistory,
  getWorkspaceGitStatus,
  mutateWorkspaceGit
} from "./git/index.js";

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

async function initializedWorkspace(): Promise<WorkspaceDefinition> {
  const workspace = await definition();
  runGit(workspace.cwd, ["init"]);
  runGit(workspace.cwd, ["config", "user.name", "PalmTTY Test"]);
  runGit(workspace.cwd, ["config", "user.email", "palmtty@example.invalid"]);
  await writeFile(path.join(workspace.cwd, "README.md"), "one\n", "utf8");
  runGit(workspace.cwd, ["add", "--", "README.md"]);
  runGit(workspace.cwd, ["commit", "-m", "initial"]);
  return workspace;
}

afterEach(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
  roots.clear();
});

describe.skipIf(!gitAvailable)("workspace Git integration", () => {
  it("reports porcelain v2 repository context and bounded diffs", async () => {
    const workspace = await initializedWorkspace();
    await writeFile(path.join(workspace.cwd, "README.md"), "one\ntwo\n", "utf8");

    const status = await getWorkspaceGitStatus(workspace);
    expect(status.available).toBe(true);
    expect(status.repository).toEqual(expect.objectContaining({
      root: expect.any(String),
      workspacePath: "",
      scope: "repository",
      stateToken: expect.stringMatching(/^[0-9a-f]{64}$/)
    }));
    expect(status.changes).toEqual([
      expect.objectContaining({
        path: "README.md",
        kind: "modified",
        staged: false,
        unstaged: true,
        untracked: false,
        conflict: false
      })
    ]);

    const diff = await getWorkspaceGitDiff(workspace, "README.md", false);
    expect(diff.staged).toBe(false);
    expect(diff.diff).toContain("+two");
    expect(diff.snapshot).toMatch(/^[0-9a-f]{64}$/);
    expect(diff.truncated).toBe(false);
  });

  it("neutralizes configured clean/process filters while reading working-tree diffs", async () => {
    const workspace = await initializedWorkspace();
    await writeFile(
      path.join(workspace.cwd, ".gitattributes"),
      "*.md filter=probe\n",
      "utf8"
    );
    runGit(workspace.cwd, ["add", "--", ".gitattributes"]);
    runGit(workspace.cwd, ["commit", "-m", "add attributes"]);
    runGit(workspace.cwd, [
      "config",
      "filter.probe.clean",
      "palmtty-filter-command-that-does-not-exist"
    ]);
    runGit(workspace.cwd, ["config", "filter.probe.required", "true"]);

    await writeFile(path.join(workspace.cwd, "README.md"), "one\ntwo\n", "utf8");
    const diff = await getWorkspaceGitDiff(workspace, "README.md", false);

    expect(diff.diff).toContain("+two");
    expect(diff.truncated).toBe(false);
  });

  it("neutralizes a filter driver literally named set", async () => {
    const workspace = await initializedWorkspace();
    await writeFile(
      path.join(workspace.cwd, ".gitattributes"),
      "*.md filter=set\n",
      "utf8"
    );
    runGit(workspace.cwd, ["add", "--", ".gitattributes"]);
    runGit(workspace.cwd, ["commit", "-m", "add set filter attribute"]);
    runGit(workspace.cwd, [
      "config",
      "filter.set.clean",
      "palmtty-filter-command-that-does-not-exist"
    ]);
    runGit(workspace.cwd, ["config", "filter.set.required", "true"]);

    await writeFile(path.join(workspace.cwd, "README.md"), "one\ntwo\n", "utf8");
    const diff = await getWorkspaceGitDiff(workspace, "README.md", false);

    expect(diff.diff).toContain("+two");
  });

  it("previews untracked files without treating directories as pseudo-paths", async () => {
    const workspace = await initializedWorkspace();
    await mkdir(path.join(workspace.cwd, "notes"), { recursive: true });
    await writeFile(
      path.join(workspace.cwd, "notes", "new file.md"),
      "hello from untracked\n",
      "utf8"
    );

    const status = await getWorkspaceGitStatus(workspace);
    expect(status.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "notes/new file.md",
        kind: "untracked",
        untracked: true
      })
    ]));

    const diff = await getWorkspaceGitDiff(
      workspace,
      "notes/new file.md",
      false
    );
    expect(diff.diff).toContain("+hello from untracked");
    expect(diff.truncated).toBe(false);
  });

  it("makes repository scope explicit when the Workspace is nested", async () => {
    const workspace = await initializedWorkspace();
    const nested = path.join(workspace.cwd, "apps", "web");
    await mkdir(nested, { recursive: true });
    const nestedWorkspace = { ...workspace, cwd: nested };

    const status = await getWorkspaceGitStatus(nestedWorkspace);
    expect(await realpath(status.repository!.root)).toBe(
      await realpath(workspace.cwd)
    );
    expect(status.repository?.workspacePath).toBe("apps/web");
    expect(status.repository?.scope).toBe("repository");
  });

  it("supports typed stage, unstage, restore, commit, branch and history operations", async () => {
    const workspace = await initializedWorkspace();
    await writeFile(path.join(workspace.cwd, "README.md"), "one\ntwo\n", "utf8");

    let status = await getWorkspaceGitStatus(workspace);
    expect(status.repository).toBeDefined();

    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "stage", paths: ["README.md"] }
    })).status;
    expect(status.changes[0]).toEqual(expect.objectContaining({
      path: "README.md",
      staged: true,
      unstaged: false
    }));

    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "unstage", paths: ["README.md"] }
    })).status;
    expect(status.changes[0]).toEqual(expect.objectContaining({
      staged: false,
      unstaged: true
    }));

    await writeFile(path.join(workspace.cwd, "SECOND.md"), "second\n", "utf8");
    status = await getWorkspaceGitStatus(workspace);
    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "stage.all" }
    })).status;
    expect(status.changes.every((entry) => entry.staged)).toBe(true);

    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "unstage.all" }
    })).status;
    expect(status.changes.every((entry) => !entry.staged)).toBe(true);

    await rm(path.join(workspace.cwd, "SECOND.md"));
    status = await getWorkspaceGitStatus(workspace);

    const diff = await getWorkspaceGitDiff(workspace, "README.md", false);
    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: {
        type: "restore",
        path: "README.md",
        diffSnapshot: diff.snapshot
      }
    })).status;
    expect(status.changes).toHaveLength(0);

    await writeFile(path.join(workspace.cwd, "README.md"), "one\ncommitted\n", "utf8");
    status = await getWorkspaceGitStatus(workspace);
    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "stage", paths: ["README.md"] }
    })).status;
    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "commit", message: "test: Git workbench commit" }
    })).status;
    expect(status.changes).toHaveLength(0);

    status = (await mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "branch.create", name: "feature/palmtty-git-test" }
    })).status;
    expect(status.repository?.head.branch).toBe("feature/palmtty-git-test");

    const branches = await getWorkspaceGitBranches(workspace);
    expect(branches.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "feature/palmtty-git-test",
        current: true
      })
    ]));

    const history = await getWorkspaceGitHistory(workspace, 20);
    expect(history.commits[0]).toEqual(expect.objectContaining({
      subject: "test: Git workbench commit"
    }));
  }, 90_000);

  it("serializes Git writes across Workspaces that share one repository", async () => {
    const workspace = await initializedWorkspace();
    await writeFile(path.join(workspace.cwd, "A.md"), "a\n", "utf8");
    await writeFile(path.join(workspace.cwd, "B.md"), "b\n", "utf8");
    const secondWorkspace = { ...workspace, id: "git-test-2" };
    const status = await getWorkspaceGitStatus(workspace);
    const expectedState = status.repository!.stateToken;

    const results = await Promise.allSettled([
      mutateWorkspaceGit(workspace, {
        expectedState,
        allowRepositoryCodeExecution: true,
        operation: { type: "stage", paths: ["A.md"] }
      }),
      mutateWorkspaceGit(secondWorkspace, {
        expectedState,
        allowRepositoryCodeExecution: true,
        operation: { type: "stage", paths: ["B.md"] }
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { name: "GitStateChangedError" }
    });
  }, 45_000);

  it("rejects stale mutations and stale destructive restores", async () => {
    const workspace = await initializedWorkspace();
    await writeFile(path.join(workspace.cwd, "README.md"), "one\ntwo\n", "utf8");
    const status = await getWorkspaceGitStatus(workspace);
    const diff = await getWorkspaceGitDiff(workspace, "README.md", false);

    await writeFile(path.join(workspace.cwd, "OTHER.md"), "changed\n", "utf8");
    await expect(mutateWorkspaceGit(workspace, {
      expectedState: status.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: { type: "stage", paths: ["README.md"] }
    })).rejects.toMatchObject({ name: "GitStateChangedError" });

    const refreshed = await getWorkspaceGitStatus(workspace);
    await writeFile(path.join(workspace.cwd, "README.md"), "one\nthree\n", "utf8");
    await expect(mutateWorkspaceGit(workspace, {
      expectedState: refreshed.repository!.stateToken,
      allowRepositoryCodeExecution: true,
      operation: {
        type: "restore",
        path: "README.md",
        diffSnapshot: diff.snapshot
      }
    })).rejects.toMatchObject({ name: "GitStateChangedError" });
  });

  it("reports a non-repository without treating it as an Agent failure", async () => {
    const workspace = await definition();
    const status = await getWorkspaceGitStatus(workspace);
    expect(status).toEqual({
      available: false,
      changes: [],
      truncated: false
    });
  });

  it("rejects repository path traversal", async () => {
    const workspace = await initializedWorkspace();
    await expect(getWorkspaceGitDiff(workspace, "../outside", false)).rejects.toThrow();
  });
});
