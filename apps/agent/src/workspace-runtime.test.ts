import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import {
  buildPtyEnvironment,
  buildWslLaunchArgs,
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

function hostWorkspace(
  cwd: string,
  shell: string,
  id = "node"
): WorkspaceDefinition {
  return {
    id,
    name: "Node",
    cwd,
    runtime: { kind: "host", shell, args: ["--version"] }
  };
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

  it("keeps an explicit protected package shell authoritative", async () => {
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

  it("reports an executable mistakenly configured as host cwd as not a directory", async () => {
    const { executable } = await fakeExecutable();

    await expect(resolveRuntimeWorkspace(
      hostWorkspace(executable, process.execPath, "bad-cwd")
    )).rejects.toThrow(
      `Workspace "bad-cwd" is not a directory: ${executable}`
    );
  });

  it("fails before PTY creation with an actionable missing-shell error", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "palmtty-workspace-"));
    tempDirs.add(directory);

    await expect(resolveRuntimeWorkspace(
      hostWorkspace(directory, "definitely-not-a-real-palmtty-shell", "missing-shell")
    )).rejects.toThrow(
      'Workspace "missing-shell" is not launchable: Shell executable "definitely-not-a-real-palmtty-shell" was not found.'
    );
  });

  it("normalizes configured host shell paths before Worker bootstrap", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "palmtty-workspace-"));
    tempDirs.add(directory);

    const definition = hostWorkspace(directory, process.execPath);
    definition.environment = {
      PALMTTY_TEST_ENVIRONMENT: "fresh"
    };
    const workspace = await resolveRuntimeWorkspace(definition);

    expect(path.isAbsolute(workspace.executable)).toBe(true);
    expect(workspace.id).toBe("node");
    expect(workspace.cwd).toBe(await realpath(directory));
    expect(workspace.env.PALMTTY_TEST_ENVIRONMENT).toBe("fresh");
  });

  it("builds the PTY environment from the resolved snapshot and removes secrets", () => {
    const environment = buildPtyEnvironment({
      id: "env",
      cwd: process.cwd(),
      executable: process.execPath,
      args: [],
      env: {
        PALMTTY_VISIBLE: "yes",
        PALMTTY_TEST_ACCESS_TOKEN: "secret"
      }
    }, ["PALMTTY_TEST_ACCESS_TOKEN"]);

    expect(environment.PALMTTY_VISIBLE).toBe("yes");
    expect(environment.PALMTTY_TEST_ACCESS_TOKEN).toBeUndefined();
    expect(environment.TERM).toBe("xterm-256color");
  });

  it("rejects WSL runtime on non-Windows hosts", async () => {
    if (process.platform === "win32") return;

    await expect(resolveRuntimeWorkspace({
      id: "wsl-only",
      name: "WSL only",
      cwd: "/home/dev/project",
      runtime: {
        kind: "wsl",
        distribution: "Ubuntu",
        args: []
      }
    })).rejects.toThrow(
      "WSL workspaces are supported only by a Windows PalmTTY Agent"
    );
  });

  it("builds WSL launch arguments without shell interpolation", () => {
    const workspace: WorkspaceDefinition = {
      id: "ubuntu",
      name: "Ubuntu",
      cwd: "/home/dev/project with spaces",
      runtime: {
        kind: "wsl",
        distribution: "Ubuntu-24.04",
        shell: "/bin/bash",
        args: ["-l"]
      }
    };

    expect(buildWslLaunchArgs(workspace)).toEqual([
      "--distribution",
      "Ubuntu-24.04",
      "--cd",
      "/home/dev/project with spaces",
      "--exec",
      "/bin/bash",
      "-l"
    ]);
  });
});
