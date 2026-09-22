import { readFileSync } from "node:fs";
import { readReleaseManifest } from "./runtime-layout.js";

type RootPackageMetadata = {
  version?: unknown;
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/u;

function sourceVersion(): string {
  const packageUrl = new URL("../../../package.json", import.meta.url);
  const metadata = JSON.parse(
    readFileSync(packageUrl, "utf8")
  ) as RootPackageMetadata;

  if (
    typeof metadata.version !== "string" ||
    !VERSION_PATTERN.test(metadata.version)
  ) {
    throw new Error("PalmTTY root package.json contains an invalid version");
  }
  return metadata.version;
}

export const PALMTTY_VERSION =
  readReleaseManifest()?.version ?? sourceVersion();
