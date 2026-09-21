import type { RuntimeCapabilities } from "@palmtty/protocol";

export const STARTUP_COMMAND_PRESETS = [
  { id: "codex", label: "Codex", command: "codex" },
  { id: "claude", label: "Claude Code", command: "claude" },
  { id: "antigravity", label: "Antigravity", command: "agy" },
  { id: "gemini", label: "Gemini CLI", command: "gemini" },
  { id: "opencode", label: "OpenCode", command: "opencode" },
  { id: "aider", label: "Aider", command: "aider" }
] as const;

export type ShellArgumentPreset = {
  id: "pwsh-default" | "pwsh-clean" | "login-shell" | "cmd-quiet";
  shell?: string;
  args: string[];
};

export function shellArgumentPresets(
  runtime: "host" | "wsl",
  platform: RuntimeCapabilities["platform"] | null
): ShellArgumentPreset[] {
  if (runtime === "wsl") {
    return [{ id: "login-shell", shell: "/bin/bash", args: ["-l"] }];
  }

  if (platform === "win32") {
    return [
      { id: "pwsh-default", shell: "pwsh.exe", args: ["-NoLogo"] },
      { id: "pwsh-clean", shell: "pwsh.exe", args: ["-NoLogo", "-NoProfile"] },
      { id: "cmd-quiet", shell: "cmd.exe", args: ["/Q"] }
    ];
  }

  if (platform === "linux" || platform === "darwin") {
    return [{ id: "login-shell", args: ["-l"] }];
  }

  return [
    { id: "pwsh-default", shell: "pwsh.exe", args: ["-NoLogo"] },
    { id: "login-shell", args: ["-l"] }
  ];
}
