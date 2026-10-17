import { describe, expect, it } from "vitest";
import { isMarkdownPath, markdownLinkTarget } from "./markdown-preview.js";

describe("Markdown file preview routing", () => {
  it("recognizes Markdown extensions only", () => {
    expect(isMarkdownPath("docs/README.MD")).toBe(true);
    expect(isMarkdownPath("notes/story.markdown")).toBe(true);
    expect(isMarkdownPath("notes/file.md.txt")).toBe(false);
    expect(isMarkdownPath("notes/file.txt")).toBe(false);
  });

  it("resolves relative links inside the workspace", () => {
    expect(markdownLinkTarget("docs/chapters/a.md", "../index.md")).toEqual({
      kind: "workspace", path: "docs/index.md"
    });
    expect(markdownLinkTarget("docs/a.md", "./new%20chapter.md#part")).toEqual({
      kind: "workspace", path: "docs/new chapter.md"
    });
    expect(markdownLinkTarget("README.md", "docs/intro.md")).toEqual({
      kind: "workspace", path: "docs/intro.md"
    });
  });

  it("refuses escape paths and executable/browser URL schemes", () => {
    for (const href of [
      "../../secrets", "../outside.md", "/etc/passwd", "\\\\server\\share",
      "//evil.example/file.md", "javascript:alert(1)", "data:text/html,hello",
      "file:///etc/passwd", "%2Fetc%2Fpasswd", "dir%5Cfile.md",
      "%2e%2e/%2e%2e/key", "https://", "bad%XX", "#section", "?raw=1"
    ]) {
      expect(markdownLinkTarget("docs/a.md", href)).toBeNull();
    }
  });

  it("allows only explicit HTTP(S) and mail links to leave the browser", () => {
    expect(markdownLinkTarget("docs/a.md", "https://example.com/a")).toEqual({
      kind: "external", href: "https://example.com/a"
    });
    expect(markdownLinkTarget("docs/a.md", "mailto:author@example.com")).toEqual({
      kind: "external", href: "mailto:author@example.com"
    });
    expect(markdownLinkTarget("docs/a.md", "ftp://example.com")).toBeNull();
  });
});
