export const PALMTTY_CONTROL_ENV_KEYS = [
  "PALMTTY_ACCESS_TOKEN",
  "PALMTTY_CONFIG",
  "PALMTTY_AGENT_URL",
  "PALMTTY_WEB_HOST",
  "PALMTTY_DEV_TRUSTED_ORIGINS",
  "PALMTTY_WINDOWS_SPAWN_TRACE"
] as const;

function environmentKeyEquals(
  left: string,
  right: string,
  platform: NodeJS.Platform
): boolean {
  return platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

export function controlEnvironmentKeys(tokenEnv: string): string[] {
  return [...new Set([
    tokenEnv,
    ...PALMTTY_CONTROL_ENV_KEYS
  ])];
}

export function isReservedControlEnvironmentKey(
  key: string,
  tokenEnv: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  return controlEnvironmentKeys(tokenEnv).some((reserved) => (
    environmentKeyEquals(key, reserved, platform)
  ));
}
