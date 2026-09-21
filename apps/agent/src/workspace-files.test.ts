import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import {
  listWorkspaceFiles,
  normalizeWorkspaceRelativePath,
  readWorkspaceFile
} from "./workspace-files.js";

const roots = new Set<string>();

async function workspace(): Promise<WorkspaceDefinition> {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-files-test-"));
  roots.add(root);
  return {
    id: "files-test",
    name: "Files test",
    cwd: root,
    runtime: { kind: "host", args: [] }
  };
}

afterEach(async () => {
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
  roots.clear();
});

describe("workspace file access", () => {
  it("lists directories before files and reads UTF-8 text", async () => {
    const definition = await workspace();
    await mkdir(path.join(definition.cwd, "src"));
    await writeFile(path.join(definition.cwd, "README.md"), "# PalmTTY\n", "utf8");

    const listing = await listWorkspaceFiles(definition, "");
    expect(listing.path).toBe("");
    expect(listing.parentPath).toBeNull();
    expect(listing.entries.map((entry) => [entry.kind, entry.name])).toEqual([
      ["directory", "src"],
      ["file", "README.md"]
    ]);

    const file = await readWorkspaceFile(definition, "README.md");
    expect(file).toMatchObject({
      path: "README.md",
      binary: false,
      content: "# PalmTTY\n",
      truncated: false
    });
  });

  it("rejects traversal and reports binary files without decoding them", async () => {
    const definition = await workspace();
    await writeFile(path.join(definition.cwd, "asset.bin"), Buffer.from([1, 0, 2, 3]));

    expect(() => normalizeWorkspaceRelativePath("../outside")).toThrow();
    expect(() => normalizeWorkspaceRelativePath("src\\index.ts")).toThrow();
    await expect(readWorkspaceFile(definition, "../outside")).rejects.toThrow();

    const file = await readWorkspaceFile(definition, "asset.bin");
    expect(file.binary).toBe(true);
    expect(file.content).toBe("");
  });

  it("bounds text previews", async () => {
    const definition = await workspace();
    await writeFile(
      path.join(definition.cwd, "large.txt"),
      "x".repeat(512 * 1024 + 128),
      "utf8"
    );

    const file = await readWorkspaceFile(definition, "large.txt");
    expect(file.binary).toBe(false);
    expect(file.truncated).toBe(true);
    expect(Buffer.byteLength(file.content, "utf8")).toBe(512 * 1024);
  });
});
