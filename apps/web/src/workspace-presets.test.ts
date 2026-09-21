import { describe, expect, it } from "vitest";
import {
  STARTUP_COMMAND_PRESETS,
  shellArgumentPresets
} from "./workspace-presets.js";

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

  it("offers runtime-appropriate shell argument examples", () => {
    expect(shellArgumentPresets("wsl", "win32")).toEqual([
      { id: "login-shell", shell: "/bin/bash", args: ["-l"] }
    ]);
    expect(shellArgumentPresets("host", "win32")).toContainEqual({
      id: "pwsh-clean",
      shell: "pwsh.exe",
      args: ["-NoLogo", "-NoProfile"]
    });
  });
});
