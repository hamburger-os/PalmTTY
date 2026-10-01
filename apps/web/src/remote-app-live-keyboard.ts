// Physical/hardware and mobile software keyboard navigation go through the
// existing typed, allowlisted Windows key path. Ordinary text and IME commits
// go through bounded Unicode text controls instead of synthesizing key events.
const liveKeys = new Set([
  "Backspace", "Delete", "Enter", "Tab", "Escape",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Home", "End", "PageUp", "PageDown"
]);

export function remoteAppLiveKeyboardKey(key: string): string | null {
  return liveKeys.has(key) ? key : null;
}
