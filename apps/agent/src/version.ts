import { readFileSync } from "node:fs";

type RootPackageMetadata = {
  version?: unknown;
};

const packageUrl = new URL("../../../package.json", import.meta.url);
const metadata = JSON.parse(
  readFileSync(packageUrl, "utf8")
) as RootPackageMetadata;

if (
  typeof metadata.version !== "string" ||
  !/^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/.test(metadata.version)
) {
  throw new Error("PalmTTY root package.json contains an invalid version");
}

export const PALMTTY_VERSION = metadata.version;
