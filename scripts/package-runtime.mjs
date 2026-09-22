import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWindowsHostCompilePowerShellCommand,
  defaultWindowsPowerShellPath,
  encodePowerShellCommand
} from "./autostart-core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function run(command, args, cwd = repoRoot, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    shell: options.shell === true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

async function requireFile(filePath, label) {
  const info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`${label} is missing: ${filePath}`);
}

function gitCommit() {
  const fromEnvironment = process.env.GITHUB_SHA?.trim();
  if (fromEnvironment && /^[0-9a-f]{40}$/u.test(fromEnvironment)) {
    return fromEnvironment;
  }
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error("Unable to resolve Git commit");
  const value = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(value)) throw new Error("Git returned an invalid commit SHA");
  return value;
}

async function findNodeLicense() {
  const base = path.dirname(process.execPath);
  const candidates = [
    path.join(base, "LICENSE"),
    path.resolve(base, "..", "LICENSE"),
    path.resolve(base, "..", "..", "LICENSE")
  ];
  for (const candidate of candidates) {
    if (await stat(candidate).then((value) => value.isFile(), () => false)) {
      return candidate;
    }
  }
  throw new Error("Unable to locate the bundled Node.js LICENSE file");
}

async function collectPackageComponents(nodeModulesRoot, palmttyVersion) {
  const components = new Map();
  const visited = new Set();

  async function walk(directory) {
    const resolved = await realpath(directory).catch(() => undefined);
    if (!resolved || visited.has(resolved)) return;
    visited.add(resolved);

    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === ".bin") continue;
      const child = path.join(directory, entry.name);
      if (entry.name === "package.json" && entry.isFile()) {
        try {
          const pkg = JSON.parse(await readFile(child, "utf8"));
          if (typeof pkg.name !== "string" || pkg.name.length === 0) continue;
          const version =
            typeof pkg.version === "string" && pkg.version.length > 0
              ? pkg.version
              : pkg.name.startsWith("@palmtty/")
                ? palmttyVersion
                : undefined;
          if (!version) continue;
          const key = `${pkg.name}@${version}`;
          const purlName = pkg.name
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/");
          components.set(key, {
            type: "library",
            "bom-ref": `pkg:npm/${purlName}@${encodeURIComponent(version)}`,
            name: pkg.name,
            version,
            purl: `pkg:npm/${purlName}@${encodeURIComponent(version)}`
          });
        } catch {
          // A malformed dependency package manifest will fail Node resolution
          // later; SBOM collection itself stays best-effort per directory.
        }
        continue;
      }

      const info = entry.isDirectory() || entry.isSymbolicLink()
        ? await stat(child).catch(() => undefined)
        : undefined;
      if (info?.isDirectory()) await walk(child);
    }
  }

  await walk(nodeModulesRoot);
  return [...components.values()].sort((a, b) =>
    a["bom-ref"].localeCompare(b["bom-ref"])
  );
}

async function writeSbom(root, manifest) {
  const components = await collectPackageComponents(
    path.join(root, "app", "node_modules"),
    manifest.version
  );
  const rootRef = `pkg:generic/palmtty@${encodeURIComponent(manifest.version)}`;
  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      component: {
        type: "application",
        "bom-ref": rootRef,
        name: "PalmTTY",
        version: manifest.version
      },
      properties: [
        { name: "palmtty:commit", value: manifest.commit },
        { name: "palmtty:platform", value: manifest.platform },
        { name: "palmtty:arch", value: manifest.arch },
        { name: "palmtty:nodeVersion", value: manifest.nodeVersion }
      ]
    },
    components,
    dependencies: [
      {
        ref: rootRef,
        dependsOn: components.map((component) => component["bom-ref"])
      }
    ]
  };
  await writeFile(
    path.join(root, "sbom.cdx.json"),
    `${JSON.stringify(sbom, null, 2)}\n`,
    "utf8"
  );
}

async function compileWindowsServiceHost(outputPath) {
  const sourcePath = path.join(repoRoot, "scripts", "windows-autostart-host.cs");
  await requireFile(sourcePath, "Windows service host source");
  const powershell = defaultWindowsPowerShellPath();
  await requireFile(powershell, "Windows PowerShell");
  const command = buildWindowsHostCompilePowerShellCommand({
    sourcePath,
    outputPath
  });
  run(powershell, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encodePowerShellCommand(command)
  ]);
  await requireFile(outputPath, "Compiled Windows service host");
}

async function main() {
  const args = process.argv.slice(2);
  const outputValue = option(args, "--out");
  const platform = option(args, "--platform") ?? process.platform;
  const arch = option(args, "--arch") ?? process.arch;
  if (!outputValue) {
    throw new Error(
      "Usage: node scripts/package-runtime.mjs --out <dir> [--platform <platform>] [--arch <arch>]"
    );
  }
  if (platform !== process.platform) {
    throw new Error(
      `PalmTTY runtime packages must be built natively: requested ${platform}, runner is ${process.platform}`
    );
  }
  if (arch !== process.arch) {
    throw new Error(
      `PalmTTY runtime packages must match the runner architecture: requested ${arch}, runner is ${process.arch}`
    );
  }
  if (!["win32", "linux"].includes(platform)) {
    throw new Error(`Distribution packaging is not implemented for ${platform}`);
  }

  const outputRoot = path.resolve(outputValue);
  const rootPackage = JSON.parse(
    await readFile(path.join(repoRoot, "package.json"), "utf8")
  );
  const version = rootPackage.version;
  if (
    typeof version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/u.test(version)
  ) {
    throw new Error("Root package.json contains an invalid PalmTTY version");
  }

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const appRoot = path.join(outputRoot, "app");
  run(pnpm, [
    "--config.node-linker=hoisted",
    "--filter",
    "@palmtty/agent",
    "--prod",
    "deploy",
    "--legacy",
    appRoot
  ], repoRoot, { shell: process.platform === "win32" });

  await cp(
    path.join(repoRoot, "apps", "web", "dist"),
    path.join(outputRoot, "web"),
    { recursive: true }
  );

  const runtimeDir = path.join(outputRoot, "runtime");
  const toolsDir = path.join(outputRoot, "tools");
  const defaultsDir = path.join(outputRoot, "defaults");
  const binDir = path.join(outputRoot, "bin");
  await Promise.all([
    mkdir(runtimeDir, { recursive: true }),
    mkdir(toolsDir, { recursive: true }),
    mkdir(defaultsDir, { recursive: true }),
    mkdir(binDir, { recursive: true })
  ]);

  const bundledNode = path.join(
    runtimeDir,
    platform === "win32" ? "node.exe" : "node"
  );
  await copyFile(process.execPath, bundledNode);
  if (platform !== "win32") await chmod(bundledNode, 0o755);

  await Promise.all([
    copyFile(
      path.join(repoRoot, "scripts", "installed-cli.mjs"),
      path.join(toolsDir, "installed-cli.mjs")
    ),
    copyFile(
      path.join(repoRoot, "scripts", "autostart-core.mjs"),
      path.join(toolsDir, "autostart-core.mjs")
    ),
    copyFile(
      path.join(repoRoot, "packaging", "default-config.yaml"),
      path.join(defaultsDir, "config.yaml")
    ),
    copyFile(
      path.join(repoRoot, "LICENSE"),
      path.join(outputRoot, "LICENSE")
    ),
    copyFile(
      await findNodeLicense(),
      path.join(outputRoot, "NODE-LICENSE")
    )
  ]);

  const manifest = {
    schemaVersion: 1,
    name: "PalmTTY",
    version,
    commit: gitCommit(),
    channel: version.includes("-") ? "prerelease" : "stable",
    platform,
    arch,
    nodeVersion: process.version
  };
  await writeFile(
    path.join(outputRoot, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  if (platform === "win32") {
    await compileWindowsServiceHost(
      path.join(binDir, "palmtty-autostart-host.exe")
    );
    await writeFile(
      path.join(binDir, "palmtty.cmd"),
      [
        "@echo off",
        "setlocal",
        'set "PALMTTY_INSTALL_ROOT=%~dp0.."',
        '"%PALMTTY_INSTALL_ROOT%\\runtime\\node.exe" "%PALMTTY_INSTALL_ROOT%\\tools\\installed-cli.mjs" %*',
        "exit /b %ERRORLEVEL%",
        ""
      ].join("\r\n"),
      "utf8"
    );
  } else {
    const launcher = `#!/bin/sh
set -eu
SELF="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
PALMTTY_INSTALL_ROOT="$(CDPATH= cd -- "$(dirname -- "$SELF")/.." && pwd)"
export PALMTTY_INSTALL_ROOT
exec "$PALMTTY_INSTALL_ROOT/runtime/node" "$PALMTTY_INSTALL_ROOT/tools/installed-cli.mjs" "$@"
`;
    const launcherPath = path.join(binDir, "palmtty");
    await writeFile(launcherPath, launcher, { encoding: "utf8", mode: 0o755 });
    await chmod(launcherPath, 0o755);
  }

  const forbiddenSourcePaths = [
    path.join(appRoot, "src"),
    path.join(appRoot, "node_modules", "@palmtty", "config", "src"),
    path.join(appRoot, "node_modules", "@palmtty", "protocol", "src")
  ];
  for (const forbidden of forbiddenSourcePaths) {
    if (await stat(forbidden).then(() => true, () => false)) {
      throw new Error(
        `Production deployment unexpectedly contains workspace source: ${forbidden}`
      );
    }
  }

  await writeSbom(outputRoot, manifest);
  console.log(
    `[PalmTTY] packaged ${version} for ${platform}-${arch}: ${outputRoot}`
  );
}

main().catch((error) => {
  console.error(
    `[PalmTTY] package failed: ${error instanceof Error ? error.message : error}`
  );
  process.exitCode = 1;
});
