import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";

const webgl = vi.hoisted(() => ({
  listeners: [] as Array<() => void>,
  options: [] as Array<{ customGlyphs?: boolean }>,
  constructFails: false,
  disposed: 0,
  listenersDisposed: 0
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class {
    constructor(options: { customGlyphs?: boolean }) {
      if (webgl.constructFails) throw new Error("WebGL2 unavailable");
      webgl.options.push(options);
    }
    onContextLoss(listener: () => void) {
      webgl.listeners.push(listener);
      return { dispose: () => { webgl.listenersDisposed += 1; } };
    }
    dispose() { webgl.disposed += 1; }
  }
}));

import { installTerminalRenderer } from "./terminal-renderer.js";

function terminal() {
  return { loadAddon: vi.fn() } as Pick<Terminal, "loadAddon">;
}

beforeEach(() => {
  webgl.listeners.length = 0;
  webgl.options.length = 0;
  webgl.constructFails = false;
  webgl.disposed = 0;
  webgl.listenersDisposed = 0;
});

describe("browser terminal renderer", () => {
  it("loads one custom-glyph renderer and disposes it on unmount", () => {
    const t = terminal();
    const cleanup = installTerminalRenderer(t);
    expect(t.loadAddon).toHaveBeenCalledTimes(1);
    expect(webgl.options).toEqual([{ customGlyphs: true }]);
    cleanup();
    cleanup();
    expect(webgl.disposed).toBe(1);
    expect(webgl.listenersDisposed).toBe(1);
  });

  it("falls back to DOM if WebGL2 is unavailable", () => {
    webgl.constructFails = true;
    const t = terminal();
    const cleanup = installTerminalRenderer(t);
    expect(t.loadAddon).not.toHaveBeenCalled();
    cleanup();
    expect(webgl.disposed).toBe(0);
  });

  it("falls back to DOM when renderer activation fails", () => {
    const t = terminal();
    vi.mocked(t.loadAddon).mockImplementation(() => { throw new Error("GPU failure"); });
    const cleanup = installTerminalRenderer(t);
    cleanup();
    expect(webgl.disposed).toBe(1);
    expect(webgl.listenersDisposed).toBe(1);
  });

  it("releases WebGL on context loss without disposing the terminal", () => {
    const t = terminal();
    const cleanup = installTerminalRenderer(t);
    webgl.listeners[0]!();
    cleanup();
    expect(webgl.disposed).toBe(1);
    expect(webgl.listenersDisposed).toBe(1);
    expect(t.loadAddon).toHaveBeenCalledTimes(1);
  });
});
