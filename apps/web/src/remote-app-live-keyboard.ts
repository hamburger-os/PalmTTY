// Physical/hardware and mobile software keyboard navigation go through the
// existing typed, allowlisted Windows key path. Ordinary text and IME commits
// go through bounded Unicode text controls instead of synthesizing key events.
const liveKeys = new Set([
  "Backspace", "Delete", "Enter", "Tab", "Escape",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Home", "End", "PageUp", "PageDown"
]);

/** Do not submit a half-formed iOS/Chinese composition or its final duplicate. */
export function shouldCommitRemoteLiveText(
  composing: boolean, nativeComposing: boolean, finalCompositionPending: boolean
): boolean {
  return !composing && !nativeComposing && !finalCompositionPending;
}

export function remoteAppLiveKeyboardKey(key: string): string | null {
  return liveKeys.has(key) ? key : null;
}
