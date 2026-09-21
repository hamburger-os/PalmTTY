import { describe, expect, it } from "vitest";
import * as pty from "node-pty";
import { resolveExecutable } from "./workspace-runtime.js";

async function resolvePowerShellForConPty(): Promise<string> {
  const candidates = process.env.PALMTTY_TEST_REQUIRE_PWSH === "1"
    ? ["pwsh.exe"]
    : ["pwsh.exe", "powershell.exe"];

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      return await resolveExecutable(candidate, { cwd: process.cwd() });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    "No PowerShell executable is available for the Windows ConPTY smoke test. " +
    failures.join(" ")
  );
}

describe("Windows ConPTY smoke test", () => {
  it("spawns PowerShell and round-trips Unicode", async () => {
    if (process.platform !== "win32") return;

    const shell = await resolvePowerShellForConPty();

    const output = await new Promise<string>((resolve, reject) => {
      let transcript = "";
      const terminal = pty.spawn(shell, ["-NoLogo", "-NoProfile"], {
        name: "xterm-256color",
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env,
        // PalmTTY uses node-pty's bundled ConPTY DLL on Windows so explicit
        // termination does not fork the visible console-list helper.
        useConptyDll: true
      });

      const timeout = setTimeout(() => {
        try { terminal.kill(); } catch { /* best effort */ }
        reject(new Error("PowerShell ConPTY smoke test timed out"));
      }, 15_000);

      terminal.onData((data) => {
        transcript += data;
      });

      terminal.onExit(({ exitCode }) => {
        clearTimeout(timeout);
        if (exitCode === 0) resolve(transcript);
        else reject(new Error(`PowerShell exited with code ${exitCode}: ${transcript}`));
      });

      terminal.resize(100, 30);
      terminal.write('[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); Write-Output "PALMTTY_中文_OK"; exit\r');
    });

    expect(output).toContain("PALMTTY_中文_OK");
  }, 20_000);
});
