// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderMarkdown, renderSafeAuthorHtml, markdownHeadingSlug } from "./markdown-render.js";
import { isSafeMermaidSource } from "./markdown-mermaid-policy.js";

const labels = { table: "Scrollable table", tableHint: "Swipe horizontally" };
function preview(markdown: string, path = "docs/chapter.md"): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderMarkdown(markdown, path, labels);
  return container;
}

describe("safe author HTML", () => {
  it("renders explicit breaks and safe formatting within a table cell", () => {
    const root = preview("| Chapter |\n| - |\n| Alpha<br>Beta<br/>Gamma |");
    const cell = root.querySelector("td")!;
    expect(cell.querySelectorAll("br")).toHaveLength(2);
    expect(cell.textContent).toContain("Alpha");
    expect(cell.textContent).toContain("Beta");
    expect(root.querySelectorAll(".markdown-table-scroll")).toHaveLength(1);
  });

  it("permits safe inline labels, folds and comments without author-controlled attributes", () => {
    const root = preview(
      "Text <sup>2</sup> <sub>3</sub> <u>underline</u> " +
      "<mark>marked</mark> <kbd>Ctrl</kbd> <small>small</small>\n\n" +
      "<details><summary>Read me</summary>Secret</details>\n\n<!-- hidden note -->"
    );
    for (const tag of ["sup", "sub", "u", "mark", "kbd", "small", "details", "summary"]) {
      expect(root.querySelector(tag)).toBeTruthy();
    }
    expect(root.textContent).not.toContain("hidden note");
    expect(renderSafeAuthorHtml('<br onclick="evil()">')).toContain("&lt;br");
  });

  it("never emits source-authored executable HTML, image network requests or inline handlers", () => {
    const root = preview(
      '<script>alert(1)</script><img src="https://evil.example/test.png">' +
      '<iframe src="https://evil.example"></iframe>' +
      '<u onclick="alert(1)">test</u>' +
      '\n\n![remote](https://evil.example/remote.png)'
    );
    expect(root.querySelector("script, img, iframe")).toBeNull();
    expect(root.querySelector("[onclick],[src],[srcset]")).toBeNull();
    expect(root.innerHTML).not.toContain("<script>");
    expect(root.textContent).toContain("remote");
  });
});

describe("Markdown navigation and confined images", () => {
  it("gives repeated headings stable preview-local anchor names", () => {
    const root = preview("# 世界观\n\n# 世界观\n\n[go](#世界观)");
    expect([...root.querySelectorAll("h1")].map(h => (h as HTMLElement).dataset.markdownAnchor))
      .toEqual(["世界观", "世界观-1"]);
    expect(root.querySelector("a")?.getAttribute("data-markdown-fragment")).toBe("世界观");
    expect(markdownHeadingSlug("Hello, 世界！")).toBe("hello-世界");
    expect([...root.querySelectorAll("[id]")].every(element =>
      element.id.startsWith("palmtty-md-"))).toBe(true);
  });

  it("routes only local images through the Workspace API placeholder", () => {
    const root = preview("![local](./images/map.png) ![remote](https://evil.example/map.png)");
    expect(root.querySelectorAll(".markdown-local-image")).toHaveLength(1);
    expect(root.querySelector<HTMLElement>(".markdown-local-image")?.dataset.markdownImagePath)
      .toBe("docs/images/map.png");
    expect(root.querySelector("img")).toBeNull();
  });

  it("retains external URL fragments and GFM task list markers", () => {
    const root = preview("[web](https://example.com/readme#part)\n\n- [x] Done\n- [ ] Pending");
    expect(root.querySelector("a")?.href).toBe("https://example.com/readme#part");
    expect(root.textContent).toContain("☑");
    expect(root.textContent).toContain("☐");
    expect(root.querySelector("input")).toBeNull();
  });

  it("keeps file and in-file fragment links distinct and rejects dangerous schemes", () => {
    const root = preview(
      "[same](#chapter-1) [other](../outline.md#summary) " +
      "[evil](javascript:alert(1)) [web](https://example.com)"
    );
    const links = [...root.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links[0]?.dataset.markdownFragment).toBe("chapter-1");
    expect(links[1]?.dataset.markdownWorkspacePath).toBe("outline.md");
    expect(links[1]?.dataset.markdownFragment).toBe("summary");
    expect(links[2]?.textContent).toBe("web");
    expect(links[2]?.rel).toContain("noreferrer");
  });
});

describe("Markdown extensions and bounds", () => {
  it("renders GFM alert, footnote, math and syntax-highlighted code", () => {
    const root = preview(
      "> [!NOTE]\n> A note\n\n" +
      "Footnote[^a].\n\n[^a]: Note content.\n\n" +
      "Inline $x^2$.\n\n" +
      "~~~javascript\nconst x = 1;\n~~~"
    );
    expect(root.querySelector(".markdown-alert")).toBeTruthy();
    expect(root.querySelector(".footnotes")).toBeTruthy();
    expect(root.querySelector(".katex")).toBeTruthy();
    expect(root.querySelector(".hljs-keyword")).toBeTruthy();
  });

  it("keeps Mermaid source inert before a visible-only rendering request", () => {
    const root = preview("~~~mermaid\ngraph TD\nA-->B\n~~~");
    expect(root.querySelector("code.language-mermaid")?.textContent).toContain("graph TD");
    expect(root.querySelector("svg, iframe")).toBeNull();
    expect(isSafeMermaidSource("graph TD\nA-->B")).toBe(true);
    for (const source of [
      "%%{init: {'theme': 'base'}}%%\ngraph TD\nA-->B",
      "graph TD\nclick A https://evil.example",
      "graph TD\nA[<img src=x>]",
      "graph TD\nA-->B\nhref A javascript:alert(1)",
      "---\nconfig:\n  securityLevel: loose\n---\ngraph TD\nA-->B",
      "graph TD\nconfig: { securityLevel: loose }",
      "graph TD\nA[//evil.example/image]",
      "A".repeat(12_001)
    ]) expect(isSafeMermaidSource(source)).toBe(false);
  });

  it("retains source text in read-only preview even when markup is incomplete", () => {
    const root = preview("## Incomplete\n\n| A | B |\n|---|---|\n| text |");
    expect(root.querySelector("h2")?.textContent).toBe("Incomplete");
    expect(root.querySelector(".markdown-table-scroll")).toBeTruthy();
  });
});
