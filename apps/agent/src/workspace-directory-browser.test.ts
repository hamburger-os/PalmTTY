import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { browseWorkspaceDirectory } from "./workspace-directory-browser.js";

const tempDirs = new Set<string>();

afterEach(async () => {
  for (const directory of tempDirs) {
    await rm(directory, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe("workspace directory browser", () => {
  it("returns directories only with a selectable current path and parent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-directory-"));
    tempDirs.add(root);
    await mkdir(path.join(root, "alpha"));
    await mkdir(path.join(root, "beta"));
    await writeFile(path.join(root, "not-a-directory.txt"), "ignored");

    const listing = await browseWorkspaceDirectory({
      kind: "host",
      path: root
    });

    expect(listing.currentPath).toBe(root);
    expect(listing.parentPath).toBe(path.dirname(root));
    expect(listing.directories.map((entry) => entry.label)).toEqual([
      "alpha",
      "beta"
    ]);
    expect(listing.directories.every((entry) => path.isAbsolute(entry.path)))
      .toBe(true);
  });

  it("rejects a host file path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-directory-"));
    tempDirs.add(root);
    const file = path.join(root, "file.txt");
    await writeFile(file, "not a directory");

    await expect(browseWorkspaceDirectory({
      kind: "host",
      path: file
    })).rejects.toThrow("not a directory");
  });
});
