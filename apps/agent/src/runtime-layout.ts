import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseManifest = {
  schemaVersion: 1;
  name: "PalmTTY";
  version: string;
  commit: string;
  platform: string;
  arch: string;
  nodeVersion: string;
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/u;

function manifestPath(root: string): string {
  return path.join(root, "release-manifest.json");
}

function validInstalledRoot(root: string): boolean {
  return path.isAbsolute(root) && existsSync(manifestPath(root));
}

export function installedRoot(
  env: NodeJS.ProcessEnv = process.env,
  moduleUrl: string = import.meta.url
): string | undefined {
  const explicit = env.PALMTTY_INSTALL_ROOT?.trim();
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!validInstalledRoot(resolved)) {
      throw new Error(
        `PALMTTY_INSTALL_ROOT does not contain a PalmTTY release manifest: ${resolved}`
      );
    }
    return resolved;
  }

  // Installed layout: <installRoot>/app/dist/<module>.js.
  // Source/build layout: <repo>/apps/agent/{src,dist}/<module>.*, whose
  // two-level parent is <repo>/apps and therefore has no release manifest.
  const candidate = fileURLToPath(new URL("../../", moduleUrl));
  return validInstalledRoot(candidate) ? candidate : undefined;
}

export function defaultWebRoot(
  env: NodeJS.ProcessEnv = process.env,
  moduleUrl: string = import.meta.url
): string {
  const root = installedRoot(env, moduleUrl);
  return root
    ? path.join(root, "web")
    : fileURLToPath(new URL("../../web/dist/", moduleUrl));
}

export function readReleaseManifest(
  env: NodeJS.ProcessEnv = process.env,
  moduleUrl: string = import.meta.url
): ReleaseManifest | undefined {
  const root = installedRoot(env, moduleUrl);
  if (!root) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(manifestPath(root), "utf8"));
  } catch (error) {
    throw new Error("PalmTTY release manifest is unreadable", { cause: error });
  }

  if (
    !value ||
    typeof value !== "object" ||
    (value as Record<string, unknown>).schemaVersion !== 1 ||
    (value as Record<string, unknown>).name !== "PalmTTY" ||
    typeof (value as Record<string, unknown>).version !== "string" ||
    !VERSION_PATTERN.test((value as Record<string, string>).version) ||
    typeof (value as Record<string, unknown>).commit !== "string" ||
    !/^[0-9a-f]{40}$/u.test((value as Record<string, string>).commit) ||
    typeof (value as Record<string, unknown>).platform !== "string" ||
    typeof (value as Record<string, unknown>).arch !== "string" ||
    typeof (value as Record<string, unknown>).nodeVersion !== "string"
  ) {
    throw new Error("PalmTTY release manifest is invalid");
  }

  return value as ReleaseManifest;
}
