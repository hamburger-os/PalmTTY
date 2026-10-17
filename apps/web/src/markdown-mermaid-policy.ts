/** Diagram source is untrusted. Disallow directives, external resources and
 * click handlers before Mermaid builds its temporary SVG in the host DOM. */
export function isSafeMermaidSource(source: string): boolean {
  const content = source.trim();
  // Mermaid YAML frontmatter and directives can override securityLevel and
  // resource settings. Reject them before the renderer processes the source.
  return content.length > 0 && content.length <= 12_000 &&
    !/^---(?:\s|$)/.test(content) &&
    !/%%\{|(?:^|\s)(?:click|href)\s|(?:^|\s)(?:config|securityLevel|htmlLabels|dompurifyConfig)\s*:|https?:\/\/|\/\/[^\s]|data:|javascript:|<\s*\/?[a-z]/im.test(content);
}
