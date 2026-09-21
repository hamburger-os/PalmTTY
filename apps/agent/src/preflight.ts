import type { PalmTTYConfig } from "@palmtty/config";
import { assertAuthEnvironment } from "./auth.js";
import { probeServerEndpoint } from "./server-endpoint.js";
import { assertSecureExposure } from "./security.js";

export type RuntimePreflightOptions = {
  serverProbe?: (server: PalmTTYConfig["server"]) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function preflightRuntime(
  config: PalmTTYConfig,
  options: RuntimePreflightOptions = {}
): Promise<void> {
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

  if (issues.length > 0) {
    throw new Error(
      ["Runtime preflight failed:", ...issues.map((issue) => `- ${issue}`)].join("\n")
    );
  }
}
