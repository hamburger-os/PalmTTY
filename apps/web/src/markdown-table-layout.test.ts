import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tableNeedsHorizontalScroll } from "./markdown-table-layout.js";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Markdown table overflow ownership", () => {
  it("shows hints and keyboard focus only for real horizontal overflow", () => {
    expect(tableNeedsHorizontalScroll(300, 300)).toBe(false);
    expect(tableNeedsHorizontalScroll(300.5, 300)).toBe(false);
    expect(tableNeedsHorizontalScroll(302, 300)).toBe(true);
    expect(tableNeedsHorizontalScroll(1500, 320)).toBe(true);
    expect(tableNeedsHorizontalScroll(600, 0)).toBe(false);
  });

  it("keeps semantic table layout inside a dedicated horizontal viewport", () => {
    expect(styles).toMatch(/\.file-markdown-preview \.markdown-table-scroll\s*\{[^}]*overflow-x: auto;[^}]*overflow-y: hidden;/s);
    expect(styles).toMatch(/\.file-markdown-preview \.markdown-table-scroll > table\s*\{[^}]*width: max-content;[^}]*min-width: 100%;/s);
    expect(styles).toMatch(/\.file-markdown-preview \.markdown-table-scroll td\s*\{[^}]*min-width: 9rem;[^}]*overflow-wrap: break-word;/s);
    expect(styles).not.toMatch(/\.file-markdown-preview table\s*\{\s*display: block;/);
  });
});
