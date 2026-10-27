import { access, constants, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Operator-installed runtime only. Never discover PalmTTY's retired private install. */
export async function findOfficialHarnessCli(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir()
): Promise<string | undefined> {
  if (platform === "win32") {
    const root = path.join(env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Programs", "DeepSeek Harness");
    const cli = path.join(root, "resources", "runtime", "cli", "bin", "dsh.cmd");
    try {
      for (const file of [cli, path.join(root, "DeepSeek Harness.exe"), path.join(root, "resources", "app.asar")]) {
        if (!(await stat(file)).isFile()) return undefined;
      }
      if ((await stat(cli)).size > 16_384) return undefined;
      const shim = await readFile(cli, "utf8");
      if (!shim.includes("ELECTRON_RUN_AS_NODE=1") || !shim.includes("dsh-desktop-host") || !shim.includes("lib\\cli.js")) return undefined;
      return cli;
    } catch { return undefined; }
  }
  // POSIX hosts may provide their own official dsh CLI; identify its package,
  // rather than executing an unrelated command merely because it is on PATH.
  const candidates = [path.join(home, ".local", "bin", "dsh"), "/usr/local/bin/dsh", "/usr/bin/dsh",
    ...(env.PATH ?? "").split(path.delimiter).filter(Boolean).map(dir => path.join(dir, "dsh"))];
  for (const candidate of new Set(candidates)) {
    try {
      const file = await realpath(candidate);
      const root = path.dirname(path.dirname(file));
      if (file !== path.join(root, "lib", "bin.js")) continue;
      const manifest = path.join(root, "package.json");
      if ((await stat(manifest)).size > 65_536) continue;
      const info = JSON.parse(await readFile(manifest, "utf8")) as {name?:string;bin?:{dsh?:string}};
      if (info.name !== "@deepseek-ai/dsh" || info.bin?.dsh !== "lib/bin.js") continue;
      await access(file, constants.R_OK);
      return file;
    } catch { /* Missing or unrelated installation is not launch authority. */ }
  }
  return undefined;
}
