import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildWindowsHostCompilePowerShellCommand, defaultWindowsPowerShellPath, encodePowerShellCommand } from "./autostart-core.mjs";

if (process.platform === "win32") {
  const source = fileURLToPath(new URL("./windows-autostart-host.cs", import.meta.url));
  const hash = createHash("sha256").update(readFileSync(source)).digest("hex");
  const destination = fileURLToPath(new URL(`../apps/agent/dist/palmtty-process-host-${hash}.exe`, import.meta.url));
  const stamp = fileURLToPath(new URL("../apps/agent/dist/process-host.sha256", import.meta.url));
  if (!existsSync(destination)) {
    mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = destination + "." + randomUUID() + ".exe";
    try {
      const command = buildWindowsHostCompilePowerShellCommand({ sourcePath: source, outputPath: temporary });
      const result = spawnSync(defaultWindowsPowerShellPath(), ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(command)], { windowsHide: true, encoding: "utf8" });
      if (result.status !== 0) throw new Error("Windows process host compilation failed: " + (result.stderr ?? ""));
      renameSync(temporary, destination);
    } finally { rmSync(temporary, { force: true }); }
  }
  if (!existsSync(stamp) || readFileSync(stamp, "utf8") !== hash) writeFileSync(stamp, hash);
}
