import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import {
  getWorkspaceGitCommit,
  getWorkspaceGitCommitDiff,
  getWorkspaceGitHistory
} from "./index.js";

const execFileAsync = promisify(execFile);
const roots = new Set<string>();

async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8"
  });
  return result.stdout.trim();
}

async function fixture(): Promise<{
  root: string;
  workspace: WorkspaceDefinition;
  first: string;
  second: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-git-history-"));
  roots.add(root);
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.name", "PalmTTY Test"]);
  await git(root, ["config", "user.email", "palmtty@example.invalid"]);
  await git(root, ["config", "commit.gpgsign", "false"]);

  await writeFile(path.join(root, "chapter.md"), "first version\n", "utf8");
  await git(root, ["add", "chapter.md"]);
  await git(root, ["commit", "-m", "chapter one"]);
  const first = await git(root, ["rev-parse", "HEAD"]);

  await writeFile(
    path.join(root, "chapter.md"),
    "first version\nsecond version\n",
    "utf8"
  );
  await git(root, ["add", "chapter.md"]);
  await git(root, ["commit", "-m", "revise chapter"]);
  const second = await git(root, ["rev-parse", "HEAD"]);

  return {
    root,
    first,
    second,
    workspace: {
      id: "git-history-test",
      name: "Git history test",
      cwd: root,
      runtime: { kind: "host", args: [] }
    }
  };
}

afterEach(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
  roots.clear();
});

describe("Git history inspection", () => {
  it("pages against a stable snapshot and supports path history", async () => {
    const { root, workspace, first, second } = await fixture();

    const page = await getWorkspaceGitHistory(workspace, { limit: 1 });
    expect(page.commits).toHaveLength(1);
    expect(page.commits[0]?.oid).toBe(second);
    expect(page.snapshot).toBe(second);
    expect(page.nextCursor).toBeTruthy();
    expect(page.nextCursor!.length).toBeLessThanOrEqual(512);

    await writeFile(path.join(root, "notes.md"), "new note\n", "utf8");
    await git(root, ["add", "notes.md"]);
    await git(root, ["commit", "-m", "notes only"]);

    const next = await getWorkspaceGitHistory(workspace, {
      limit: 1,
      cursor: page.nextCursor!
    });
    expect(next.snapshot).toBe(second);
    expect(next.commits.map((commit) => commit.oid)).toEqual([first]);

    const chapterHistory = await getWorkspaceGitHistory(workspace, {
      limit: 10,
      path: "chapter.md"
    });
    expect(chapterHistory.commits.map((commit) => commit.subject)).toEqual([
      "revise chapter",
      "chapter one"
    ]);
    expect(chapterHistory.path).toBe("chapter.md");
  });

  it("inspects merge commits against their first parent", async () => {
    const { root, workspace, first } = await fixture();

    await git(root, ["branch", "topic", first]);
    await git(root, ["switch", "topic"]);
    await writeFile(path.join(root, "topic.md"), "topic change\n", "utf8");
    await git(root, ["add", "topic.md"]);
    await git(root, ["commit", "-m", "topic change"]);

    await git(root, ["switch", "main"]);
    await git(root, ["merge", "--no-ff", "topic", "-m", "merge topic"]);
    const mergeOid = await git(root, ["rev-parse", "HEAD"]);

    const detail = await getWorkspaceGitCommit(workspace, mergeOid);
    expect(detail.parents).toHaveLength(2);
    expect(detail.files).toEqual([
      expect.objectContaining({
        path: "topic.md",
        status: "added"
      })
    ]);

    const diff = await getWorkspaceGitCommitDiff(
      workspace,
      mergeOid,
      "topic.md"
    );
    expect(diff.diff).toContain("+topic change");
  });

  it("returns commit metadata, changed files and bounded textual diff", async () => {
    const { workspace, second } = await fixture();

    const detail = await getWorkspaceGitCommit(workspace, second);
    expect(detail).toMatchObject({
      oid: second,
      subject: "revise chapter",
      author: "PalmTTY Test",
      truncated: false
    });
    expect(detail.files).toEqual([
      expect.objectContaining({
        path: "chapter.md",
        status: "modified"
      })
    ]);

    const diff = await getWorkspaceGitCommitDiff(
      workspace,
      second,
      "chapter.md"
    );
    expect(diff.oid).toBe(second);
    expect(diff.path).toBe("chapter.md");
    expect(diff.binary).toBe(false);
    expect(diff.truncated).toBe(false);
    expect(diff.diff).toContain("+second version");
  });
});
