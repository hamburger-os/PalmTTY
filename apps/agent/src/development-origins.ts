import type { PalmTTYConfig } from "@palmtty/config";

function normalizedDevelopmentOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Development trusted Origin must use http or https: ${value}`
    );
  }
  if (parsed.origin !== value) {
    throw new Error(
      `Development trusted Origin must be an exact origin without a path: ${value}`
    );
  }
  return parsed.origin;
}

export function parseDevelopmentTrustedOrigins(
  source: string | undefined
): string[] {
  if (!source) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      "PALMTTY_DEV_TRUSTED_ORIGINS must be a JSON array of exact Origins",
      { cause: error }
    );
  }

  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new Error(
      "PALMTTY_DEV_TRUSTED_ORIGINS must be a JSON array of exact Origins"
    );
  }

  return [...new Set(parsed.map(normalizedDevelopmentOrigin))];
}

export function withDevelopmentTrustedOrigins(
  config: PalmTTYConfig,
  source: string | undefined
): PalmTTYConfig {
  const additional = parseDevelopmentTrustedOrigins(source);
  if (additional.length === 0) return config;

  return {
    ...config,
    server: {
      ...config.server,
      trustedOrigins: [...new Set([
        ...config.server.trustedOrigins,
        ...additional
      ])]
    }
  };
}
