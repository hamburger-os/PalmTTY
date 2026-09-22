import { describe, expect, it } from "vitest";
import type { GitChange } from "@palmtty/protocol";
import {
  canRestoreWorkingTreeChange,
  gitMutationPaths
} from "./git-change.js";

function change(overrides: Partial<GitChange> = {}): GitChange {
  return {
    path: "src/new.ts",
    kind: "modified",
    staged: false,
    unstaged: true,
    untracked: false,
    conflict: false,
    ...overrides
  };
}

describe("Git change actions", () => {
  it("includes both paths for rename-aware stage and unstage operations", () => {
    expect(gitMutationPaths(change({
      kind: "renamed",
      originalPath: "src/old.ts"
    }))).toEqual(["src/old.ts", "src/new.ts"]);
  });

  it("keeps destructive restore limited to a single tracked non-conflict path", () => {
    expect(canRestoreWorkingTreeChange(change())).toBe(true);
    expect(canRestoreWorkingTreeChange(change({ untracked: true }))).toBe(false);
    expect(canRestoreWorkingTreeChange(change({ conflict: true }))).toBe(false);
    expect(canRestoreWorkingTreeChange(change({
      kind: "renamed",
      originalPath: "src/old.ts"
    }))).toBe(false);
  });
});
