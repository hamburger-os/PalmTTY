function normalizedKey(
  key: string,
  platform: NodeJS.Platform
): string {
  return platform === "win32" ? key.toUpperCase() : key;
}

function isPalmTTYNamespaceKey(
  key: string,
  platform: NodeJS.Platform
): boolean {
  return normalizedKey(key, platform).startsWith("PALMTTY_");
}

export function controlEnvironmentKeys(
  tokenEnv: string,
  environment: NodeJS.ProcessEnv | Record<string, string> = process.env,
  platform: NodeJS.Platform = process.platform
): string[] {
  const result = new Set<string>([tokenEnv]);

  for (const key of Object.keys(environment)) {
    if (isPalmTTYNamespaceKey(key, platform)) result.add(key);
  }

  return [...result];
}

export function isReservedControlEnvironmentKey(
  key: string,
  tokenEnv: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  return (
    normalizedKey(key, platform) === normalizedKey(tokenEnv, platform) ||
    isPalmTTYNamespaceKey(key, platform)
  );
}
