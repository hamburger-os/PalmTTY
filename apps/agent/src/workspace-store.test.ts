import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import { FileWorkspaceStore, MemoryWorkspaceStore } from "./workspace-store.js";

const tempDirs = new Set<string>();

afterEach(async () => {
  for (const directory of tempDirs) {
    await rm(directory, { recursive: true, force: true });
  }
  tempDirs.clear();
});

function workspace(id = "main"): WorkspaceDefinition {
  return {
    id,
    name: "Main",
    cwd: process.cwd(),
    runtime: { kind: "host", args: [] }
  };
}

describe("workspace store", () => {
  it("persists workspace CRUD atomically in a versioned document", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "palmtty-workspaces-"));
    tempDirs.add(directory);
    const filePath = path.join(directory, "workspaces.json");
    const store = new FileWorkspaceStore(filePath);
    await store.initialize();

    await store.create(workspace());
    expect(store.get("main")?.name).toBe("Main");

    await store.replace("main", { ...workspace(), name: "Renamed" });
    expect(store.list()).toHaveLength(1);
    expect(store.get("main")?.name).toBe("Renamed");

    const document = JSON.parse(await readFile(filePath, "utf8")) as {
      version: number;
      workspaces: WorkspaceDefinition[];
    };
    expect(document.version).toBe(1);
    expect(document.workspaces[0]?.name).toBe("Renamed");

    await store.delete("main");
    expect(store.list()).toEqual([]);
  });

  it("keeps memory store values isolated from caller mutation", async () => {
    const initial = workspace();
    const store = new MemoryWorkspaceStore([initial]);
    await store.initialize();
    initial.name = "Changed outside";

    expect(store.get("main")?.name).toBe("Main");
  });
});
