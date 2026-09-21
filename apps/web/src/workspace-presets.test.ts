import { describe, expect, it } from "vitest";
import { STARTUP_COMMAND_PRESETS } from "./workspace-presets.js";

describe("workspace presets", () => {
  it("keeps common agent launch commands explicit", () => {
    expect(Object.fromEntries(
      STARTUP_COMMAND_PRESETS.map((preset) => [preset.id, preset.command])
    )).toMatchObject({
      codex: "codex",
      claude: "claude",
      antigravity: "agy",
      gemini: "gemini",
      opencode: "opencode",
      aider: "aider"
    });
  });
});
