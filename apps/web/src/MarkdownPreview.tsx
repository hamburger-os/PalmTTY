import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { readWorkspaceImage } from "./api.js";
import { renderMarkdown } from "./markdown-render.js";
import { isSafeMermaidSource } from "./markdown-mermaid-policy.js";
import { tableNeedsHorizontalScroll } from "./markdown-table-layout.js";
import { useI18n } from "./i18n.js";
import "katex/dist/katex.min.css";

let nextDiagramId = 0;

function scrollToFragment(root: HTMLElement, fragment: string): void {
  const normalized = fragment.toLocaleLowerCase();
  const target = [...root.querySelectorAll<HTMLElement>("[data-markdown-anchor]")]
    .find((node) => node.dataset.markdownAnchor?.toLocaleLowerCase() === normalized);
  if (!target) return;
  root.scrollTop += target.getBoundingClientRect().top -
    root.getBoundingClientRect().top - 8;
}

function observeTables(root: HTMLElement): () => void {
  const viewports = [...root.querySelectorAll<HTMLElement>(".markdown-table-scroll")];
  const update = () => {
    for (const viewport of viewports) {
      const overflowing = tableNeedsHorizontalScroll(viewport.scrollWidth, viewport.clientWidth);
      viewport.parentElement?.toggleAttribute("data-overflowing", overflowing);
      viewport.tabIndex = overflowing ? 0 : -1;
    }
  };
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
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
}

function loadLocalImages(root: HTMLElement, workspaceId: string): () => void {
  let disposed = false;
  const urls: string[] = [];
  const placeholders = [...root.querySelectorAll<HTMLElement>(".markdown-local-image")]
    .slice(0, 24);
  const pending: HTMLElement[] = [];
  const requested = new Set<HTMLElement>();
  let active = 0;
  const next = () => {
    if (disposed) return;
    while (active < 2 && pending.length > 0) {
      const holder = pending.shift()!;
      const path = holder.dataset.markdownImagePath;
      if (!path) continue;
      active += 1;
      void readWorkspaceImage(workspaceId, path).then((blob) => {
        if (disposed) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const image = document.createElement("img");
        image.alt = holder.getAttribute("aria-label") ?? "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("load", () => {
          if (disposed) return;
          holder.replaceChildren(image);
        }, { once: true });
        image.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
        image.src = url;
      }).catch(() => {
        // Preserve the source's safe alt-text placeholder on read failure.
      }).finally(() => {
        active -= 1;
        next();
      });
    }
  };
  const enqueue = (holder: HTMLElement) => {
    if (requested.has(holder)) return;
    requested.add(holder);
    pending.push(holder);
    next();
  };
  const observer = typeof IntersectionObserver === "undefined" ? null :
    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer?.unobserve(entry.target);
          enqueue(entry.target as HTMLElement);
        }
      }
    }, { root, rootMargin: "240px" });
  for (const holder of placeholders) {
    if (observer) observer.observe(holder);
    else enqueue(holder);
  }
  return () => {
    disposed = true;
    observer?.disconnect();
    for (const url of urls) URL.revokeObjectURL(url);
  };
}

function renderMermaidDiagrams(root: HTMLElement, failedLabel: string): () => void {
  let disposed = false;
  const diagrams = [...root.querySelectorAll<HTMLElement>("pre > code.language-mermaid")]
    .slice(0, 8);
  let busy = false;
  const queue: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const run = async () => {
    if (busy || disposed) return;
    busy = true;
    while (!disposed && queue.length > 0) {
      const code = queue.shift()!;
      const source = code.textContent ?? "";
      if (!isSafeMermaidSource(source)) continue;
      try {
        // The large diagram engine is loaded only after a diagram approaches view.
        const { default: mermaid } = await import("mermaid");
        if (disposed) break;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          maxTextSize: 12_000,
          theme: document.documentElement.dataset.theme === "frosted" ? "default" : "dark",
          flowchart: { htmlLabels: false }
        });
        const { svg } = await mermaid.render("palmtty-md-diagram-" + (++nextDiagramId), source);
        if (disposed) break;
        const safeSvg = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ["style"],
          FORBID_TAGS: ["foreignObject", "script", "image", "use"],
          FORBID_ATTR: ["href", "xlink:href"]
        });
        if (!safeSvg.includes("<svg")) throw new Error("No safe SVG");
        const frame = document.createElement("iframe");
        frame.className = "markdown-mermaid-frame";
        frame.setAttribute("sandbox", "");
        frame.setAttribute("loading", "lazy");
        frame.title = "Mermaid diagram";
        // Sandboxed, inert document: no scripts, links, network images or fetches.
        frame.srcdoc = "<!doctype html><meta charset='utf-8'>" +
          "<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; " +
          "style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'\">" +
          "<style>html,body{margin:0;overflow:auto;background:transparent}" +
          "svg{display:block;max-width:100%;height:auto;margin:auto}</style>" + safeSvg;
        code.parentElement?.replaceWith(frame);
      } catch {
        if (disposed) break;
        const hint = document.createElement("p");
        hint.className = "markdown-diagram-error";
        hint.textContent = failedLabel;
        code.parentElement?.insertAdjacentElement("afterend", hint);
      }
    }
    busy = false;
  };
  const enqueue = (code: HTMLElement) => {
    if (seen.has(code)) return;
    seen.add(code);
    queue.push(code);
    void run();
  };
  const observer = typeof IntersectionObserver === "undefined" ? null :
    new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer?.unobserve(entry.target);
        enqueue(entry.target as HTMLElement);
      }
    }, { root, rootMargin: "240px" });
  for (const code of diagrams) {
    if (observer) observer.observe(code);
    else enqueue(code);
  }
  return () => {
    disposed = true;
    observer?.disconnect();
  };
}

export function MarkdownPreview({ content, path, workspaceId, initialFragment, onOpenFile }: {
  content: string;
  path: string;
  workspaceId: string;
  initialFragment?: string | undefined;
  onOpenFile(path: string, fragment?: string): void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLElement>(null);
  const table = t("files.markdownTable");
  const tableHint = t("files.markdownTableHint");
  const diagramError = t("files.markdownDiagramError");
  const html = useMemo(() => renderMarkdown(content, path, { table, tableHint }),
    [content, path, table, tableHint]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const disposeTables = observeTables(root);
    const disposeImages = loadLocalImages(root, workspaceId);
    const disposeDiagrams = renderMermaidDiagrams(root, diagramError);
    return () => {
      disposeTables();
      disposeImages();
      disposeDiagrams();
    };
  }, [html, workspaceId, diagramError]);

  useEffect(() => {
    if (initialFragment && rootRef.current) scrollToFragment(rootRef.current, initialFragment);
  }, [html, initialFragment]);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest<HTMLAnchorElement>("a");
    if (!anchor || !event.currentTarget.contains(anchor)) return;
    const filePath = anchor.dataset.markdownWorkspacePath;
    const fragment = anchor.dataset.markdownFragment;
    if (filePath) {
      event.preventDefault();
      onOpenFile(filePath, fragment);
    } else if (fragment) {
      event.preventDefault();
      scrollToFragment(event.currentTarget, fragment);
    }
  };
  return (
    <article ref={rootRef} className="file-markdown-preview" tabIndex={0}
      onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
