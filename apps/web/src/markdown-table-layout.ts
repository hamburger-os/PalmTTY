/** Ignore fractional scroll-width rounding, but show the hint for real overflow. */
export function tableNeedsHorizontalScroll(scrollWidth: number, clientWidth: number): boolean {
  return clientWidth > 0 && scrollWidth > clientWidth + 1;
}
