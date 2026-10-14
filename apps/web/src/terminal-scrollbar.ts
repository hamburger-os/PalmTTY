// xterm uses the same width for its scrollable element and FitAddon's
// terminal-column calculation. Prefer a narrow indicator on touch devices
// without disabling xterm's scrollback, inertia or mouse-mode ownership.
export const TOUCH_TERMINAL_SCROLLBAR_WIDTH = 4;
export const POINTER_TERMINAL_SCROLLBAR_WIDTH = 8;

export function terminalScrollbarWidth(coarsePointer: boolean): number {
  return coarsePointer
    ? TOUCH_TERMINAL_SCROLLBAR_WIDTH
    : POINTER_TERMINAL_SCROLLBAR_WIDTH;
}
