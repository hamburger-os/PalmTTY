export type TerminalDockMode = "compact" | "full" | "hidden";

/** Presentation-only; never controls the terminal connection or PTY lifecycle. */
export function nextTerminalDockMode(
  current: TerminalDockMode, action: "toggle" | "hide" | "show"
): TerminalDockMode {
  if (action === "hide") return "hidden";
  if (action === "show") return "compact";
  return current === "full" ? "compact" : "full";
}
