/** Browser-only Markdown link policy: local paths reuse the Workspace Files API. */
export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

export type MarkdownTarget =
  | { kind: "external"; href: string }
  | { kind: "workspace"; path: string };

export function markdownLinkTarget(currentPath: string, href: string): MarkdownTarget | null {
  const value = href.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return { kind: "external", href: url.href };
      }
    } catch { /* invalid URL */ }
    return null;
  }
  if (/^mailto:[^\s]+$/i.test(value)) {
    return { kind: "external", href: value };
  }
  // Never turn an absolute path, cross-origin URL, scheme or protocol-relative
  // reference into a fetch from the PalmTTY Agent.
  if (!value || /^[/?#\\]/.test(value) || /^[a-z][a-z\d+.-]*:/i.test(value)) {
    return null;
  }
  const pathPart = value.split(/[?#]/, 1)[0] ?? "";
  let decoded: string;
  try { decoded = decodeURIComponent(pathPart); }
  catch { return null; }
  if (!decoded || /[\\\0?#:]/.test(decoded) || decoded.startsWith("/")) return null;
  const parts = currentPath.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  const path = parts.join("/");
  return path ? { kind: "workspace", path } : null;
}
