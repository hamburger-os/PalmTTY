import { describe, expect, it } from "vitest";
import { repositoryFileHistoryPath } from "./git-history.js";

describe("repositoryFileHistoryPath", () => {
  it("keeps root-workspace paths unchanged", () => {
    expect(repositoryFileHistoryPath("", "chapters/0009.md"))
      .toBe("chapters/0009.md");
  });

  it("maps workspace-relative files into a containing parent repository", () => {
    expect(repositoryFileHistoryPath(
      "books/novel-forge",
      "chapters/0009.md"
    )).toBe("books/novel-forge/chapters/0009.md");
  });
});
