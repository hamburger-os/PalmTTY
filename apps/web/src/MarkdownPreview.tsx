import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import { markdownLinkTarget } from "./markdown-preview.js";
import { tableNeedsHorizontalScroll } from "./markdown-table-layout.js";
import { useI18n } from "./i18n.js";

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// Each document is parsed locally. Nothing is submitted to a rendering service.
const parser = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // Render raw HTML as text *before* sanitization. Constructing a detached
    // HTML DOM with untrusted <img> can itself cause an unwanted network load.
    html({ text }) {
      return escapeHtml(text);
    },
    // Markdown images must not silently fetch arbitrary remote URLs with the
    // reader's network identity. Keep alt text visible without creating a fetch.
    image({ text }) {
      return '<span class="markdown-image-label">[' + escapeHtml(text) + "]</span>";
    },
    checkbox({ checked }) {
      return checked ? "☑ " : "☐ ";
    }
  }
});

function safeHtml(content: string, currentPath: string, tableLabel: string, tableHint: string): string {
  const parsed = parser.parse(content, { async: false });
  const sanitized = DOMPurify.sanitize(parsed, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "img", "input", "form", "iframe", "object", "embed", "svg", "math",
      "video", "audio", "picture", "source", "style"
    ],
    FORBID_ATTR: ["style", "src", "srcset", "id", "name", "formaction", "autofocus"]
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;

  // Preserve the native table layout. Only its outer viewport scrolls sideways;
  // the article remains the sole vertical scroll owner.
  for (const table of template.content.querySelectorAll("table")) {
    const container = document.createElement("div");
    container.className = "markdown-table-container";
    const viewport = document.createElement("div");
    viewport.className = "markdown-table-scroll";
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", tableLabel);
    viewport.tabIndex = -1;
    const hint = document.createElement("p");
    hint.className = "markdown-table-hint";
    hint.textContent = tableHint;
    hint.setAttribute("aria-hidden", "true");
    table.replaceWith(container);
    viewport.append(table);
    container.append(viewport, hint);
  }

  for (const anchor of template.content.querySelectorAll("a")) {
    const destination = markdownLinkTarget(currentPath, anchor.getAttribute("href") ?? "");
    if (destination?.kind === "workspace") {
      anchor.setAttribute("href", "#");
      anchor.dataset.workspacePath = destination.path;
    } else if (destination?.kind === "external") {
      anchor.setAttribute("href", destination.href);
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    } else {
      anchor.replaceWith(...anchor.childNodes);
    }
  }
  return template.innerHTML;
}

export function MarkdownPreview({ content, path, onOpenFile }: {
  content: string;
  path: string;
  onOpenFile(path: string): void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLElement>(null);
  const tableLabel = t("files.markdownTable");
  const tableHint = t("files.markdownTableHint");
  const html = useMemo(
    () => safeHtml(content, path, tableLabel, tableHint),
    [content, path, tableLabel, tableHint]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const viewports = [...root.querySelectorAll<HTMLElement>(".markdown-table-scroll")];
    if (!viewports.length) return;
    const update = () => {
      for (const viewport of viewports) {
        const overflow = tableNeedsHorizontalScroll(viewport.scrollWidth, viewport.clientWidth);
        viewport.parentElement?.toggleAttribute("data-overflowing", overflow);
        // Keyboard users enter only tables with additional offscreen columns.
        viewport.tabIndex = overflow ? 0 : -1;
      }
    };
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(update) : null;
    for (const viewport of viewports) {
      observer?.observe(viewport);
      const table = viewport.querySelector("table");
      if (table) observer?.observe(table);
    }
    if (!observer) window.addEventListener("resize", update);
    update();
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", update);
    };
  }, [html]);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a[data-workspace-path]");
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    event.preventDefault();
    const destination = anchor.dataset.workspacePath;
    if (destination) onOpenFile(destination);
  };
  return (
    <article ref={rootRef} className="file-markdown-preview" tabIndex={0}
      onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
