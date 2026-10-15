import type { Terminal } from "@xterm/headless";

// SerializeAddon restores mouse tracking (e.g. DECSET 1000/1002), but not
// the independently negotiated encoding (DECSET 1006/1015/1016). Capture
// those CSI transitions while the canonical headless parser handles PTY
// output. Do not sniff raw chunks: escape sequences can span PTY frames,
// and text/OSC payloads must never be mistaken for terminal control codes.
type MouseEncoding = "default" | "sgr" | "urxvt" | "sgr-pixels";

export class TerminalMouseEncoding {
  private encoding: MouseEncoding = "default";

  constructor(terminal: Pick<Terminal, "parser">) {
    const update = (params: (number | number[])[], enabled: boolean): false => {
      for (const param of params) {
        if (typeof param !== "number") continue;
        const encoding: MouseEncoding | undefined =
          param === 1006 ? "sgr"
            : param === 1015 ? "urxvt"
              : param === 1016 ? "sgr-pixels" : undefined;
        if (!encoding) continue;
        if (enabled) this.encoding = encoding;
        else if (this.encoding === encoding) this.encoding = "default";
      }
      // The built-in xterm parser must still apply every mode change.
      return false;
    };

    terminal.parser.registerCsiHandler(
      { prefix: "?", final: "h" }, (params) => update(params, true)
    );
    terminal.parser.registerCsiHandler(
      { prefix: "?", final: "l" }, (params) => update(params, false)
    );
    terminal.parser.registerEscHandler({ final: "c" }, () => {
      this.encoding = "default";
      return false;
    });
  }

  snapshotSuffix(): string {
    switch (this.encoding) {
      case "sgr": return "\u001b[?1006h";
      case "urxvt": return "\u001b[?1015h";
      case "sgr-pixels": return "\u001b[?1016h";
      default: return "";
    }
  }
}
