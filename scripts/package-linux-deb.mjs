import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

async function main() {
  if (process.platform !== "linux") {
    throw new Error("Debian packages must be built on Linux");
  }
  const args = process.argv.slice(2);
  const rootArg = option(args, "--root");
  const outArg = option(args, "--out");
  if (!rootArg || !outArg) {
    throw new Error(
      "Usage: node scripts/package-linux-deb.mjs --root <runtime-root> --out <file.deb>"
    );
  }

  const root = path.resolve(rootArg);
  const out = path.resolve(outArg);
  const manifest = JSON.parse(
    await readFile(path.join(root, "release-manifest.json"), "utf8")
  );
  if (manifest.platform !== "linux" || manifest.arch !== "x64") {
    throw new Error("Debian packaging currently requires a linux-x64 runtime");
  }

  const temp = await mkdtemp(path.join(os.tmpdir(), "palmtty-deb-"));
  try {
    const installRoot = path.join(temp, "usr", "lib", "palmtty");
    await mkdir(path.dirname(installRoot), { recursive: true });
    await cp(root, installRoot, { recursive: true });
    const binDir = path.join(temp, "usr", "bin");
    await mkdir(binDir, { recursive: true });
    await symlink("../lib/palmtty/bin/palmtty", path.join(binDir, "palmtty"));

    const controlDir = path.join(temp, "DEBIAN");
    await mkdir(controlDir, { recursive: true, mode: 0o755 });
    const control = `Package: palmtty
Version: ${manifest.version}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: PalmTTY contributors
Homepage: https://github.com/hamburger-os/PalmTTY
Depends: libc6, libstdc++6
Description: Mobile-first self-hosted remote development workbench
 PalmTTY installs a self-contained Agent runtime and Web/PWA assets.
 The service remains a current-user process; no system service is installed.
`;
    await writeFile(path.join(controlDir, "control"), control, "utf8");
    await mkdir(path.dirname(out), { recursive: true });
    run("dpkg-deb", ["--build", "--root-owner-group", temp, out]);
    console.log(`[PalmTTY] built Debian package: ${out}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(
    `[PalmTTY] deb packaging failed: ${error instanceof Error ? error.message : error}`
  );
  process.exitCode = 1;
});
