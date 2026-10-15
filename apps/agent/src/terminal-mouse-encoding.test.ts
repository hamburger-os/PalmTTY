import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { Terminal as HeadlessTerminalType } from "@xterm/headless";
import type { SerializeAddon as SerializeAddonType } from "@xterm/addon-serialize";
import { TerminalMouseEncoding } from "./terminal-mouse-encoding.js";

const require = createRequire(import.meta.url);
const { Terminal: HeadlessTerminal } = require("@xterm/headless") as typeof import("@xterm/headless");
const { SerializeAddon } = require("@xterm/addon-serialize") as typeof import("@xterm/addon-serialize");

function fixture(): {
  terminal: HeadlessTerminalType;
  serializer: SerializeAddonType;
  encoding: TerminalMouseEncoding;
} {
  const terminal = new HeadlessTerminal({ cols: 80, rows: 24, allowProposedApi: true });
  const serializer = new SerializeAddon();
  terminal.loadAddon(serializer);
  const encoding = new TerminalMouseEncoding(terminal);
  return { terminal, serializer, encoding };
}

function write(terminal: HeadlessTerminalType, value: string): Promise<void> {
  return new Promise((resolve) => terminal.write(value, resolve));
}

describe("canonical terminal mouse encoding snapshot", () => {
  it("restores SGR encoding missing from SerializeAddon without replacing tracking", async () => {
    const { terminal, serializer, encoding } = fixture();
    try {
      await write(terminal, "\u001b[?1049h\u001b[?1000h\u001b[?1002h\u001b[?1003h\u001b[?1004h\u001b[?1006hPi transcript");
      const base = serializer.serialize();
      expect(base).toContain("\u001b[?1003h");
      expect(base).toContain("\u001b[?1049h");
      expect(base).not.toContain("\u001b[?1006h");
      expect(encoding.snapshotSuffix()).toBe("\u001b[?1006h");

      const restored = new HeadlessTerminal({ cols: 80, rows: 24, allowProposedApi: true });
      const restoredEncoding = new TerminalMouseEncoding(restored);
      try {
        await write(restored, base + encoding.snapshotSuffix());
        expect(restored.modes.mouseTrackingMode).toBe("any");
        expect(restored.buffer.active.type).toBe("alternate");
        expect(restoredEncoding.snapshotSuffix()).toBe("\u001b[?1006h");
        expect(restored.buffer.active.getLine(0)?.translateToString()).toContain("Pi transcript");
        // A subsequent AI reply does not renegotiate the encoding; it must
        // remain active after snapshot recovery and ordinary output.
        await write(restored, "\r\nmore AI output");
        expect(restoredEncoding.snapshotSuffix()).toBe("\u001b[?1006h");
      } finally {
        restored.dispose();
      }
    } finally {
      terminal.dispose();
    }
  });

  it("parses split CSI output, preserves last selected encoding and honors resets", async () => {
    const { terminal, encoding } = fixture();
    try {
      await write(terminal, "\u001b[?10");
      await write(terminal, "06h");
      expect(encoding.snapshotSuffix()).toBe("\u001b[?1006h");
      await write(terminal, "\u001b[?1015;1006h");
      // xterm does not implement urxvt 1015: it cannot override SGR.
      expect(encoding.snapshotSuffix()).toBe("\u001b[?1006h");
      await write(terminal, "\u001b[?1016h");
      expect(encoding.snapshotSuffix()).toBe("\u001b[?1016h");
      await write(terminal, "\u001b[?1016l");
      expect(encoding.snapshotSuffix()).toBe("");
      await write(terminal, "\u001b[?1006h\u001bc");
      expect(encoding.snapshotSuffix()).toBe("");
    } finally {
      terminal.dispose();
    }
  });

  it("ignores control-looking text inside OSC and output glyphs", async () => {
    const { terminal, encoding } = fixture();
    try {
      await write(terminal, "\u001b]0;fake ?1006h\u0007");
      expect(encoding.snapshotSuffix()).toBe("");
      await write(terminal, "normal text ?1006h");
      expect(encoding.snapshotSuffix()).toBe("");
    } finally {
      terminal.dispose();
    }
  });
});
