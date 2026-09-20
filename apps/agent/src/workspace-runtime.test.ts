import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveExecutable,
  resolveRuntimeWorkspace
} from "./workspace-runtime.js";

const tempDirs = new Set<string>();

afterEach(async () => {
  for (const directory of tempDirs) {
    await rm(directory, { recursive: true, force: true });
  }
  tempDirs.clear();
});

async function fakeExecutable(): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "palmtty-shell-"));
  tempDirs.add(directory);
  const filename = process.platform === "win32" ? "fake-shell.exe" : "fake-shell";
  const executable = path.join(directory, filename);
  await writeFile(executable, "");
  if (process.platform !== "win32") await chmod(executable, 0o700);
  return { directory, executable };
}

describe("workspace runtime resolution", () => {
  it("resolves a bare executable from the final PATH entry", async () => {
    const { directory, executable } = await fakeExecutable();
    const prefix = process.platform === "win32" ? "C:\\definitely-missing" : "/definitely-missing";
    const resolved = await resolveExecutable("fake-shell", {
      cwd: directory,
      env: {
        PATH: [prefix, directory].join(path.delimiter),
        ...(process.platform === "win32" ? { PATHEXT: ".EXE;.CMD" } : {})
      }
    });

    expect(path.normalize(resolved)).toBe(path.normalize(await realpath(executable)));
  });

  it("fails before PTY creation with an actionable missing-shell error", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "palmtty-workspace-"));
    tempDirs.add(directory);

    await expect(resolveRuntimeWorkspace({
      id: "missing-shell",
      name: "Missing shell",
      cwd: directory,
      shell: "custom",
      shellPath: "definitely-not-a-real-palmtty-shell",
      args: [],
      env: {}
    })).rejects.toThrow(
      'Workspace "missing-shell" is not launchable: Shell executable "definitely-not-a-real-palmtty-shell" was not found.'
    );
  });

  it("normalizes configured shell paths before Worker bootstrap", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "palmtty-workspace-"));
    tempDirs.add(directory);

    const workspace = await resolveRuntimeWorkspace({
      id: "node",
      name: "Node",
      cwd: directory,
      shell: "custom",
      shellPath: process.execPath,
      args: ["--version"],
      env: {}
    });

    expect(path.isAbsolute(workspace.executable)).toBe(true);
    expect(workspace.id).toBe("node");
    expect(workspace.cwd).toBe(await realpath(directory));
  });
});
