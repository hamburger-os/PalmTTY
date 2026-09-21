import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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

  it("skips protected package PATH entries and accepts the user App Execution Alias", async () => {
    if (process.platform !== "win32") return;

    const localRoot = await mkdtemp(path.join(os.tmpdir(), "palmtty-localappdata-"));
    const programRoot = await mkdtemp(path.join(os.tmpdir(), "palmtty-programfiles-"));
    tempDirs.add(localRoot);
    tempDirs.add(programRoot);

    const windowsApps = path.join(localRoot, "Microsoft", "WindowsApps");
    const protectedPackage = path.join(
      programRoot,
      "WindowsApps",
      "Microsoft.PowerShell_7.6.6.0_x64__test"
    );
    await mkdir(windowsApps, { recursive: true });
    await mkdir(protectedPackage, { recursive: true });

    const alias = path.join(windowsApps, "pwsh.exe");
    const protectedExecutable = path.join(protectedPackage, "pwsh.exe");
    await writeFile(alias, "");
    await writeFile(protectedExecutable, "");

    const resolved = await resolveExecutable("pwsh.exe", {
      cwd: localRoot,
      env: {
        LOCALAPPDATA: localRoot,
        ProgramFiles: programRoot,
        PATH: [protectedPackage, windowsApps].join(path.delimiter),
        PATHEXT: ".EXE"
      }
    });

    expect(path.normalize(resolved)).toBe(path.normalize(alias));
  });

  it("keeps an explicit protected package shellPath authoritative", async () => {
    if (process.platform !== "win32") return;

    const programRoot = await mkdtemp(path.join(os.tmpdir(), "palmtty-programfiles-"));
    tempDirs.add(programRoot);
    const protectedPackage = path.join(
      programRoot,
      "WindowsApps",
      "Microsoft.PowerShell_7.6.6.0_x64__test"
    );
    await mkdir(protectedPackage, { recursive: true });
    const explicitExecutable = path.join(protectedPackage, "pwsh.exe");
    await writeFile(explicitExecutable, "");

    const resolved = await resolveExecutable(explicitExecutable, {
      cwd: programRoot,
      env: {
        ProgramFiles: programRoot,
        PATH: ""
      }
    });

    expect(path.normalize(resolved)).toBe(
      path.normalize(await realpath(explicitExecutable))
    );
  });

  it("keeps ordinary PATH precedence ahead of the user WindowsApps alias", async () => {
    if (process.platform !== "win32") return;

    const localRoot = await mkdtemp(path.join(os.tmpdir(), "palmtty-localappdata-"));
    const ordinary = await mkdtemp(path.join(os.tmpdir(), "palmtty-ordinary-path-"));
    tempDirs.add(localRoot);
    tempDirs.add(ordinary);

    const windowsApps = path.join(localRoot, "Microsoft", "WindowsApps");
    await mkdir(windowsApps, { recursive: true });

    const alias = path.join(windowsApps, "pwsh.exe");
    const ordinaryExecutable = path.join(ordinary, "pwsh.exe");
    await writeFile(alias, "");
    await writeFile(ordinaryExecutable, "");

    const resolved = await resolveExecutable("pwsh.exe", {
      cwd: localRoot,
      env: {
        LOCALAPPDATA: localRoot,
        ProgramFiles: "C:\\Program Files",
        PATH: [ordinary, windowsApps].join(path.delimiter),
        PATHEXT: ".EXE"
      }
    });

    expect(path.normalize(resolved)).toBe(
      path.normalize(await realpath(ordinaryExecutable))
    );
  });

  it("reports an executable mistakenly configured as cwd as not a directory", async () => {
    const { executable } = await fakeExecutable();

    await expect(resolveRuntimeWorkspace({
      id: "bad-cwd",
      name: "Bad cwd",
      cwd: executable,
      shell: "custom",
      shellPath: process.execPath,
      args: [],
      env: {}
    })).rejects.toThrow(
      `Workspace "bad-cwd" is not a directory: ${executable}`
    );
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
