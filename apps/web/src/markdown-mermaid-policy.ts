/** Diagram source is untrusted. Disallow directives, external resources and
 * click handlers before Mermaid builds its temporary SVG in the host DOM. */
export function isSafeMermaidSource(source: string): boolean {
  return source.trim().length > 0 && source.length <= 12_000 &&
    !/%%\{|(?:^|\s)(?:click|href)\s|https?:\/\/|data:|javascript:|<\s*\/?[a-z]/im.test(source);
}
