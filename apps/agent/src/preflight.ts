import type { PalmTTYConfig } from "@palmtty/config";
import { assertAuthEnvironment } from "./auth.js";
import { assertSecureExposure } from "./security.js";
import {
  resolveRuntimeWorkspaces,
  type RuntimeWorkspace
} from "./workspace-runtime.js";

export type RuntimePreflight = {
  workspaces: ReadonlyMap<string, RuntimeWorkspace>;
};

export async function preflightRuntime(
  config: PalmTTYConfig
): Promise<RuntimePreflight> {
  assertSecureExposure(config);
  assertAuthEnvironment(config.auth);
  return {
    workspaces: await resolveRuntimeWorkspaces(config.workspaces)
  };
}
