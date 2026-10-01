import { spawn } from "node:child_process";
import { access, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installedRoot } from "./runtime-layout.js";
import { defaultRemoteAppRuntimeDir } from "./remote-app-worker-storage.js";

function quotePowerShellLiteral(value: string): string {
  if (/\r|\n|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    throw new Error("Remote App helper path contains an unsupported control character");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function encodePowerShellCommand(command: string): string {
  return Buffer.from(command, "utf16le").toString("base64");
}

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot) throw new Error("Windows SystemRoot/WINDIR is unavailable");
  return path.win32.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true, () => false);
}

async function compileSourceHelper(outputPath: string): Promise<void> {
  const sourcePath = fileURLToPath(
    new URL("../../../scripts/windows-remote-app-host.cs", import.meta.url)
  );
  if (!await exists(sourcePath)) {
    throw new Error(`Windows Remote App helper source is unavailable: ${sourcePath}`);
  }

  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporary = `${outputPath}.${process.pid}.${Date.now()}.tmp.exe`;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type `",
    `  -Path ${quotePowerShellLiteral(sourcePath)} \``,
    `  -OutputAssembly ${quotePowerShellLiteral(temporary)} \``,
    "  -OutputType WindowsApplication `",
    "  -ReferencedAssemblies 'System.dll','System.Core.dll','System.Drawing.dll','System.Runtime.Serialization.dll','System.Xml.dll'"
  ].join("\n");

  const child = spawn(
    powershellPath(),
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodePowerShellCommand(command)
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
  );
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    if (stderr.length < 16 * 1024) stderr += chunk;
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code !== 0 || !await exists(temporary)) {
    await unlink(temporary).catch(() => undefined);
    throw new Error(
      `Could not compile Windows Remote App helper${stderr.trim() ? `: ${stderr.trim()}` : ""}`
    );
  }

  try {
    await rename(temporary, outputPath);
  } catch (error) {
    if (!await exists(outputPath)) throw error;
    await unlink(temporary).catch(() => undefined);
  }
}

let helperPromise: Promise<string> | undefined;

export async function resolveRemoteAppHost(): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("Remote Apps are currently supported only by the Windows host runtime");
  }

  helperPromise ??= (async () => {
    const root = installedRoot();
    if (root) {
      const bundled = path.join(root, "bin", "palmtty-remote-app-host.exe");
      if (!await exists(bundled)) {
        throw new Error("Installed PalmTTY runtime is missing palmtty-remote-app-host.exe");
      }
      return bundled;
    }

    const output = path.join(
      defaultRemoteAppRuntimeDir(),
      "native",
      "palmtty-remote-app-host.exe"
    );
    if (!await exists(output)) await compileSourceHelper(output);
    return output;
  })();

  return helperPromise;
}
