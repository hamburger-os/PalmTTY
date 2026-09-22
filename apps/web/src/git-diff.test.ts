import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./git-diff.js";

describe("parseUnifiedDiff", () => {
  it("assigns old/new line numbers without treating file headers as changes", () => {
    const lines = parseUnifiedDiff([
      "diff --git a/a.txt b/a.txt",
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,2 +1,3 @@",
      " one",
      "-two",
      "+second",
      "+three"
    ].join("\n"));

    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "context", oldLine: 1, newLine: 1 }),
      expect.objectContaining({ kind: "delete", oldLine: 2 }),
      expect.objectContaining({ kind: "add", newLine: 2 }),
      expect.objectContaining({ kind: "add", newLine: 3 })
    ]));
    expect(lines[1]?.kind).toBe("meta");
    expect(lines[2]?.kind).toBe("meta");
  });
});
