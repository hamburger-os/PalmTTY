import { useMemo, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import { markdownLinkTarget } from "./markdown-preview.js";

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

function safeHtml(content: string, currentPath: string): string {
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
  const html = useMemo(() => safeHtml(content, path), [content, path]);
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a[data-workspace-path]");
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    event.preventDefault();
    const destination = anchor.dataset.workspacePath;
    if (destination) onOpenFile(destination);
  };
  return (
    <article className="file-markdown-preview" tabIndex={0}
      onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
