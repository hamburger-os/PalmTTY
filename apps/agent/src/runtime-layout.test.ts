import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultWebRoot,
  installedRoot,
  readReleaseManifest
} from "./runtime-layout.js";

const temporary: string[] = [];

afterEach(() => {
  while (temporary.length > 0) {
    rmSync(temporary.pop()!, { recursive: true, force: true });
  }
});

function makeReleaseRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "palmtty-release-layout-"));
  temporary.push(root);
  writeFileSync(
    path.join(root, "release-manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "PalmTTY",
      version: "1.2.3",
      commit: "a".repeat(40),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    })
  );
  return root;
}

describe("installed runtime layout", () => {
  it("uses an explicit release root and serves Web assets from it", () => {
    const root = makeReleaseRoot();
    const env = { PALMTTY_INSTALL_ROOT: root };
    expect(installedRoot(env)).toBe(root);
    expect(defaultWebRoot(env)).toBe(path.join(root, "web"));
    expect(readReleaseManifest(env)?.version).toBe("1.2.3");
  });

  it("rejects an explicit root without the immutable release manifest", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "palmtty-bad-layout-"));
    temporary.push(root);
    expect(() => installedRoot({ PALMTTY_INSTALL_ROOT: root })).toThrow(
      /does not contain a PalmTTY release manifest/u
    );
  });

  it("keeps the source-tree Web path when no release root is present", () => {
    const sourceRoot = path.join(
      os.tmpdir(),
      "palmtty-source-layout",
      "apps",
      "agent",
      "dist"
    );
    const moduleUrl = pathToFileURL(
      path.join(sourceRoot, "runtime-layout.js")
    ).href;

    expect(installedRoot({}, moduleUrl)).toBeUndefined();
    expect(defaultWebRoot({}, moduleUrl)).toBe(
      path.join(os.tmpdir(), "palmtty-source-layout", "apps", "web", "dist")
    );
  });
});
