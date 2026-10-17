import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import javascript from "highlight.js/lib/languages/javascript";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import { Marked } from "marked";
import markedAlert from "marked-alert";
import markedFootnote from "marked-footnote";
import { markedHighlight } from "marked-highlight";
import markedKatex from "marked-katex-extension";
import { markdownLinkTarget } from "./markdown-preview.js";

for (const [name, language] of Object.entries({
  bash, css, json, javascript, markdown, python, sql, typescript, xml
})) hljs.registerLanguage(name, language);
hljs.registerAliases(["js", "jsx"], { languageName: "javascript" });
hljs.registerAliases(["ts", "tsx"], { languageName: "typescript" });
hljs.registerAliases(["html", "svg"], { languageName: "xml" });
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["md"], { languageName: "markdown" });

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// Only attribute-free formatting HTML is authored. Prevent untrusted tags from
// reaching even a detached DOM before sanitization (which might fetch images).
const allowedTags = new Set([
  "br", "sup", "sub", "u", "mark", "kbd", "small", "details", "summary"
]);

export function renderSafeAuthorHtml(source: string): string {
  return source.split(/(<!--[\s\S]*?-->|<\/?[a-z][^<>]*>)/gi).map((part) => {
    if (/^<!--[\s\S]*-->$/.test(part)) return "";
    const match = /^<\s*(\/?)([a-z]+)\s*(\/?)\s*>$/i.exec(part);
    if (!match) return escapeHtml(part);
    const name = match[2]!.toLowerCase();
    if (!allowedTags.has(name)) return escapeHtml(part);
    if (name === "br") return match[1] ? "" : "<br>";
    if (match[3]) return escapeHtml(part);
    return match[1] ? "</" + name + ">" : "<" + name + ">";
  }).join("");
}

export function markdownHeadingSlug(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .trim().replace(/\s+/g, "-");
}

export function markdownFragment(href: string): string | null {
  if (!href.startsWith("#") || href.length < 2) return null;
  try { return decodeURIComponent(href.slice(1)); }
  catch { return null; }
}

export interface MarkdownLabels {
  table: string;
  tableHint: string;
}

function markdownParser(path: string): Marked {
  // New instance per document: footnote indexing never leaks between files.
  const parser = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      checkbox({ checked }) {
        return checked ? "☑ " : "☐ ";
      },
      html({ text }) {
        return renderSafeAuthorHtml(text);
      },
      image({ href, text }) {
        const target = markdownLinkTarget(path, href);
        const alt = escapeHtml(text);
        if (target?.kind === "workspace" &&
            /\.(png|jpe?g|webp|gif)$/i.test(target.path)) {
          return '<span class="markdown-local-image" data-markdown-image-path="' +
            escapeHtml(target.path) + '" role="img" aria-label="' + alt + '">[' + alt + ']</span>';
        }
        return '<span class="markdown-image-label">[' + alt + ']</span>';
      }
    }
  });
  parser.use(
    markedFootnote(),
    markedAlert(),
    markedKatex({ throwOnError: false, trust: false, maxExpand: 100, maxSize: 12 }),
    markedHighlight({
      emptyLangClass: "hljs",
      langPrefix: "hljs language-",
      highlight(code, lang) {
        if (lang.toLowerCase() === "mermaid" || !hljs.getLanguage(lang)) {
          return escapeHtml(code);
        }
        try {
          return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch {
          return escapeHtml(code);
        }
      }
    })
  );
  return parser;
}

export function renderMarkdown(content: string, path: string, labels: MarkdownLabels): string {
  const html = markdownParser(path).parse(content, { async: false });
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
    FORBID_TAGS: [
      "img", "image", "use", "iframe", "object", "embed", "script",
      "style", "foreignObject", "form", "input", "textarea", "button",
      "select", "video", "audio", "picture", "source", "link", "meta", "base"
    ],
    FORBID_ATTR: [
      "src", "srcset", "formaction", "autofocus", "name", "target", "rel", "srcdoc"
    ]
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;

  // Generated headings and footnotes are scoped to this article, never to
  // the host document's global element ids.
  for (const element of template.content.querySelectorAll<HTMLElement>("[id]")) {
    const id = element.id;
    element.removeAttribute("id");
    if (id) element.dataset.markdownAnchor = id;
  }
  const headingCounts = new Map<string, number>();
  for (const heading of template.content.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")) {
    const base = markdownHeadingSlug(heading.textContent ?? "") || "section";
    const count = headingCounts.get(base) ?? 0;
    headingCounts.set(base, count + 1);
    heading.dataset.markdownAnchor = count === 0 ? base : base + "-" + count;
  }

  for (const table of template.content.querySelectorAll("table")) {
    const container = document.createElement("div");
    container.className = "markdown-table-container";
    const viewport = document.createElement("div");
    viewport.className = "markdown-table-scroll";
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", labels.table);
    viewport.tabIndex = -1;
    const hint = document.createElement("p");
    hint.className = "markdown-table-hint";
    hint.textContent = labels.tableHint;
    hint.setAttribute("aria-hidden", "true");
    table.replaceWith(container);
    viewport.append(table);
    container.append(viewport, hint);
  }

  for (const anchor of template.content.querySelectorAll<HTMLAnchorElement>("a")) {
    const href = anchor.getAttribute("href") ?? "";
    const fragment = markdownFragment(href);
    if (fragment) {
      anchor.href = "#";
      anchor.dataset.markdownFragment = fragment;
      continue;
    }
    const external = markdownLinkTarget(path, href);
    if (external?.kind === "external") {
      anchor.href = external.href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      continue;
    }
    const hash = href.indexOf("#");
    const target = markdownLinkTarget(path, hash < 0 ? href : href.slice(0, hash));
    if (target?.kind === "workspace") {
      anchor.href = "#";
      anchor.dataset.markdownWorkspacePath = target.path;
      if (hash >= 0) {
        try { anchor.dataset.markdownFragment = decodeURIComponent(href.slice(hash + 1)); }
        catch { /* ignore invalid fragment */ }
      }
    } else if (target?.kind === "external") {
      anchor.href = target.href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    } else {
      anchor.replaceWith(...anchor.childNodes);
    }
  }

  // KaTeX and alert SVG must not reference external resources.
  for (const element of template.content.querySelectorAll("svg *")) {
    element.removeAttribute("href");
    element.removeAttribute("xlink:href");
  }
  return template.innerHTML;
}
