import type { PalmTTYConfig } from "@palmtty/config";
import { assertAuthEnvironment } from "./auth.js";
import { assertSecureExposure } from "./security.js";
import {
  resolveRuntimeWorkspace,
  type RuntimeWorkspace
} from "./workspace-runtime.js";

export type RuntimePreflight = {
  workspaces: ReadonlyMap<string, RuntimeWorkspace>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function preflightRuntime(
  config: PalmTTYConfig
): Promise<RuntimePreflight> {
  const issues: string[] = [];

  try {
    assertSecureExposure(config);
  } catch (error) {
    issues.push(errorMessage(error));
  }

  try {
    assertAuthEnvironment(config.auth);
  } catch (error) {
    issues.push(errorMessage(error));
  }

  const workspaceResults = await Promise.allSettled(
    config.workspaces.map(resolveRuntimeWorkspace)
  );
  const workspaces: RuntimeWorkspace[] = [];

  workspaceResults.forEach((result) => {
    if (result.status === "fulfilled") {
      workspaces.push(result.value);
      return;
    }
    issues.push(errorMessage(result.reason));
  });

  if (issues.length > 0) {
    throw new Error(
      ["Runtime preflight failed:", ...issues.map((issue) => `- ${issue}`)].join("\n")
    );
  }

  return {
    workspaces: new Map(workspaces.map((workspace) => [workspace.id, workspace]))
  };
}
