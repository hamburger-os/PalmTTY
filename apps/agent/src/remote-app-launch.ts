import { realpath, stat } from "node:fs/promises";
import os from "node:os";
import type {
  RemoteAppProfile,
  WorkspaceDefinition
} from "@palmtty/protocol";
import {
  applyEnvironmentOverrides,
  readHostEnvironment
} from "./host-environment.js";
import { resolveExecutable } from "./workspace-runtime.js";
import { findRegisteredPackagedApp } from "./remote-app-discovery.js";

export type ResolvedRemoteAppLaunch = {
  id: string;
  name: string;
  launch: RemoteAppProfile["launch"];
  args: string[];
  cwd: string;
  environment: Record<string, string>;
};

async function hostWorkspaceCwd(workspace: WorkspaceDefinition): Promise<string> {
  if (workspace.terminal.runtime.kind !== "host") return os.homedir();
  const resolved = await realpath(workspace.cwd);
  if (!(await stat(resolved)).isDirectory()) {
    throw new Error("Workspace " + workspace.id + " is not a directory: " + workspace.cwd);
  }
  return resolved;
}

export async function resolveRemoteAppLaunch(
  workspace: WorkspaceDefinition,
  profile: RemoteAppProfile
): Promise<ResolvedRemoteAppLaunch> {
  if (process.platform !== "win32") {
    throw new Error("Remote Apps currently require a Windows host");
  }

  const hostEnvironment = await readHostEnvironment();
  const cwd = await hostWorkspaceCwd(workspace);
  const environment = applyEnvironmentOverrides(
    hostEnvironment,
    workspace.environment ?? {}
  );
  const identity = profile.launch;
  const resolvedLaunch = identity.kind === "win32"
    ? {
        kind: "win32" as const,
        executable: await resolveExecutable(identity.executable, { cwd, env: environment })
      }
    : await findRegisteredPackagedApp(
        identity.appUserModelId, identity.packageFamilyName, environment
      ).then((present) => {
        if (!present) throw new Error("Windows package registration is missing or does not match AUMID");
        return identity;
      });

  return {
    id: profile.id,
    name: profile.name,
    launch: resolvedLaunch,
    args: profile.args,
    cwd,
    environment
  };
}

export async function validateRemoteAppProfiles(
  workspace: WorkspaceDefinition
): Promise<void> {
  if (workspace.remoteApps.length === 0 || process.platform !== "win32") return;
  for (const profile of workspace.remoteApps) {
    try {
      await resolveRemoteAppLaunch(workspace, profile);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error("Remote App \"" + profile.name + "\" is not launchable: " + detail);
    }
  }
}
