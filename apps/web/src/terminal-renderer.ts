import { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal } from "@xterm/xterm";

// Rendering only: xterm still owns touch physics, scrollback, mouse input
// and the canonical terminal geometry.
export function installTerminalRenderer(
  terminal: Pick<Terminal, "loadAddon">
): () => void {
  let addon: WebglAddon | undefined;
  let contextLossListener: { dispose(): void } | undefined;

  const disposeRenderer = () => {
    contextLossListener?.dispose();
    contextLossListener = undefined;
    const previous = addon;
    addon = undefined;
    try {
      previous?.dispose();
    } catch {
      // A failing GPU teardown must never terminate a PTY or xterm instance.
    }
  };

  try {
    const renderer = new WebglAddon({ customGlyphs: true });
    addon = renderer;
    contextLossListener = renderer.onContextLoss(disposeRenderer);
    terminal.loadAddon(renderer);
  } catch {
    // WebGL2 unavailable or addon activation failed: xterm keeps DOM rendering.
    disposeRenderer();
  }

  return disposeRenderer;
}
