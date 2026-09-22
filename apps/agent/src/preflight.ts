import {
  serverBindHost,
  type PalmTTYConfig
} from "@palmtty/config";
import { assertAuthEnvironment } from "./auth.js";
import { probeServerEndpoint, type ServerEndpoint } from "./server-endpoint.js";
import { assertSecureExposure } from "./security.js";
import { loadServerTlsOptions } from "./server-tls.js";

export type RuntimePreflightOptions = {
  serverProbe?: (server: ServerEndpoint) => Promise<void>;
  tlsProbe?: (config: Pick<PalmTTYConfig, "server">) => Promise<unknown>;
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

  if (config.server.exposure.mode === "https") {
    try {
      await (options.tlsProbe ?? loadServerTlsOptions)(config);
    } catch (error) {
      issues.push(`Direct HTTPS credentials are invalid: ${errorMessage(error)}`);
    }
  }

  if (exposureAllowed) {
    try {
      await (options.serverProbe ?? probeServerEndpoint)({
        host: serverBindHost(config),
        port: config.server.port
      });
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
