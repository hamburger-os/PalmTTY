import type { PalmTTYConfig } from "@palmtty/config";
import { assertAuthEnvironment } from "./auth.js";
import { probeServerEndpoint } from "./server-endpoint.js";
import { assertSecureExposure } from "./security.js";
import {
  resolveRuntimeWorkspace,
  type RuntimeWorkspace
} from "./workspace-runtime.js";

export type RuntimePreflight = {
  workspaces: ReadonlyMap<string, RuntimeWorkspace>;
};

export type RuntimePreflightOptions = {
  serverProbe?: (server: PalmTTYConfig["server"]) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function preflightRuntime(
  config: PalmTTYConfig,
  options: RuntimePreflightOptions = {}
): Promise<RuntimePreflight> {
  const issues: string[] = [];

  let exposureAllowed = true;
  try {
    assertSecureExposure(config);
  } catch (error) {
    exposureAllowed = false;
    issues.push(errorMessage(error));
  }

  try {
    assertAuthEnvironment(config.auth);
  } catch (error) {
    issues.push(errorMessage(error));
  }

  if (exposureAllowed) {
    try {
      await (options.serverProbe ?? probeServerEndpoint)(config.server);
    } catch (error) {
      issues.push(errorMessage(error));
    }
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
