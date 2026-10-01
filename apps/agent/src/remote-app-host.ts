import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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

const HELPER_REFERENCES = [
  "System.dll",
  "System.Core.dll",
  "System.Drawing.dll",
  "System.Runtime.Serialization.dll",
  "System.Xml.dll"
] as const;

/**
 * Content-addressed source helpers ensure a freshly restarted source Agent
 * never reuses an older compiled executable after a native C# change. Keep
 * the compiler options in the fingerprint so output semantics are covered.
 * Different paths allow existing AppWorkers to keep using their old host.
 */
export function sourceRemoteAppHostFilename(source: Buffer): string {
  const hash = createHash("sha256").update(source).update("\0WindowsApplication\0");
  for (const reference of HELPER_REFERENCES) hash.update(reference).update("\0");
  return `palmtty-remote-app-host-${hash.digest("hex").slice(0, 16)}.exe`;
}

async function compileSourceHelper(outputPath: string, source: Buffer): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporary = `${outputPath}.${process.pid}.${Date.now()}.tmp.exe`;
  const sourceSnapshot = `${temporary}.cs`;
  // Compile exactly the bytes used to generate the filename, even when a
  // developer edits the source during the PowerShell Add-Type invocation.
  await writeFile(sourceSnapshot, source, { mode: 0o600 });
  let installed = false;
  try {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      "Add-Type `",
      `  -Path ${quotePowerShellLiteral(sourceSnapshot)} \``,
      `  -OutputAssembly ${quotePowerShellLiteral(temporary)} \``,
      "  -OutputType WindowsApplication `",
      `  -ReferencedAssemblies ${HELPER_REFERENCES.map(quotePowerShellLiteral).join(",")}`
    ].join("\n");

    const child = spawn(
      powershellPath(),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
        encodePowerShellCommand(command)],
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
      throw new Error(
        `Could not compile Windows Remote App helper${stderr.trim() ? `: ${stderr.trim()}` : ""}`
      );
    }

    try {
      await rename(temporary, outputPath);
      installed = true;
    } catch (error) {
      // Concurrent source Agents compiling the same fingerprint are safe:
      // the other process may have installed its identical snapshot first.
      if (!await exists(outputPath)) throw error;
    }
  } finally {
    await unlink(sourceSnapshot).catch(() => undefined);
    if (!installed) await unlink(temporary).catch(() => undefined);
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

    const sourcePath = fileURLToPath(
      new URL("../../../scripts/windows-remote-app-host.cs", import.meta.url)
    );
    const source = await readFile(sourcePath).catch(() => {
      throw new Error(`Windows Remote App helper source is unavailable: ${sourcePath}`);
    });
    const output = path.join(
      defaultRemoteAppRuntimeDir(), "native",
      sourceRemoteAppHostFilename(source)
    );
    if (!await exists(output)) await compileSourceHelper(output, source);
    return output;
  })().catch((error: unknown) => {
    // A transient compiler failure should be retryable on the next Session.
    helperPromise = undefined;
    throw error;
  });

  return helperPromise;
}
