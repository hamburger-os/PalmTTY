import type { TerminalProfile, WorkspacePublic, WorkspaceRuntime } from "@palmtty/protocol";

function runtimeLabel(
  workspace: WorkspacePublic,
  hostLabel: string,
  wslLabel: string
): string {
  return workspace.terminal.runtime.kind === "wsl" ? wslLabel : hostLabel;
}

export function workspaceRuntimeSummary(
  workspace: WorkspacePublic,
  labels: {
    host: string;
    wsl: string;
    defaultShell: string;
  }
): string {
  const runtime = runtimeLabel(workspace, labels.host, labels.wsl);
  const shell = workspace.terminal.runtime.shell ?? labels.defaultShell;
  if (workspace.terminal.runtime.kind === "wsl" && workspace.terminal.runtime.distribution) {
    return workspace.terminal.runtime.distribution + " · " + shell;
  }
  return runtime + " · " + shell;
}

export function runtimeKey(
  kind: "host" | "wsl",
  distribution: string
): string {
  return kind === "host"
    ? "host"
    : "wsl:" + (distribution.trim().toLowerCase() || "<default>");
}

function sameArgs(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export function profileMatches(
  profile: TerminalProfile,
  kind: "host" | "wsl",
  distribution: string,
  shell: string,
  args: string[]
): boolean {
  if (profile.runtime.kind !== kind) return false;
  if (!sameArgs(profile.runtime.args, args)) return false;
  if ((profile.runtime.shell ?? "") !== shell.trim()) return false;
  if (profile.runtime.kind === "wsl") {
    return (profile.runtime.distribution ?? "").toLowerCase() ===
      distribution.trim().toLowerCase();
  }
  return true;
}

export function runtimeFromState(
  kind: "host" | "wsl",
  distribution: string,
  shell: string,
  args: string[]
): WorkspaceRuntime {
  return kind === "wsl"
    ? {
        kind: "wsl",
        ...(distribution.trim() ? { distribution: distribution.trim() } : {}),
        ...(shell.trim() ? { shell: shell.trim() } : {}),
        args
      }
    : {
        kind: "host",
        ...(shell.trim() ? { shell: shell.trim() } : {}),
        args
      };
}

