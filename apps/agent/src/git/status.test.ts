import { describe, expect, it } from "vitest";
import { parsePorcelainV2Status } from "./status.js";

const h1 = "1111111111111111111111111111111111111111";
const h2 = "2222222222222222222222222222222222222222";
const h3 = "3333333333333333333333333333333333333333";

describe("parsePorcelainV2Status", () => {
  it("parses branch metadata, tracked, renamed and untracked records", () => {
    const source = [
      "# branch.oid " + h1,
      "# branch.head feature/git",
      "# branch.upstream origin/feature/git",
      "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 " + h1 + " " + h1 + " README.md",
      "2 R. N... 100644 100644 100644 " + h1 + " " + h2 + " R100 src/new name.ts",
      "src/old name.ts",
      "? notes/new file.md",
      ""
    ].join("\0");

    const status = parsePorcelainV2Status(
      source,
      { root: "/repo", workspacePath: "apps/web" },
      false
    );

    expect(status.repository).toMatchObject({
      root: "/repo",
      workspacePath: "apps/web",
      upstream: "origin/feature/git",
      ahead: 2,
      behind: 1,
      head: {
        oid: h1,
        branch: "feature/git",
        detached: false,
        unborn: false
      }
    });
    expect(status.changes).toEqual([
      expect.objectContaining({
        path: "README.md",
        kind: "modified",
        staged: false,
        unstaged: true
      }),
      expect.objectContaining({
        path: "src/new name.ts",
        originalPath: "src/old name.ts",
        kind: "renamed",
        staged: true,
        unstaged: false
      }),
      expect.objectContaining({
        path: "notes/new file.md",
        kind: "untracked",
        untracked: true
      })
    ]);
  });

  it("parses conflicts and detached/unborn heads", () => {
    const conflict = [
      "# branch.oid " + h1,
      "# branch.head (detached)",
      "u UU N... 100644 100644 100644 100644 " +
        h1 + " " + h2 + " " + h3 + " src/conflict.ts",
      ""
    ].join("\0");
    const detached = parsePorcelainV2Status(
      conflict,
      { root: "/repo", workspacePath: "" },
      false
    );
    expect(detached.repository?.head).toMatchObject({
      oid: h1,
      detached: true,
      unborn: false
    });
    expect(detached.changes[0]).toMatchObject({
      path: "src/conflict.ts",
      kind: "conflict",
      conflict: true,
      staged: true,
      unstaged: true
    });

    const unborn = parsePorcelainV2Status(
      "# branch.oid (initial)\0# branch.head main\0",
      { root: "/repo", workspacePath: "" },
      false
    );
    expect(unborn.repository?.head).toEqual({
      branch: "main",
      detached: false,
      unborn: true
    });
  });

  it("marks malformed or bounded status output as truncated instead of trusting it", () => {
    const status = parsePorcelainV2Status(
      "? ../escape\0",
      { root: "/repo", workspacePath: "" },
      true
    );
    expect(status.changes).toEqual([]);
    expect(status.truncated).toBe(true);
  });
});
