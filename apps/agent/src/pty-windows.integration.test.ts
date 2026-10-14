import { describe, expect, it } from "vitest";
import * as pty from "node-pty";
import { buildHostStartupArgs, resolveExecutable } from "./workspace-runtime.js";

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

async function expectPtyStartupOutput(shell: string, args: string[], marker: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let transcript = "";
    let finished = false;
    const terminal = pty.spawn(shell, args, {
      name: "xterm-256color", cols: 80, rows: 24,
      cwd: process.cwd(), env: process.env,
      ...(process.platform === "win32" ? { useConptyDll: true } : {})
    });
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      try { terminal.kill(); } catch { /* best effort */ }
      reject(new Error("Startup PTY timeout: " + transcript));
    }, 15_000);
    terminal.onData((data) => {
      transcript += data;
      if (finished || !transcript.includes(marker)) return;
      finished = true;
      clearTimeout(timeout);
      try { terminal.kill(); } catch { /* best effort */ }
      resolve();
    });
    terminal.onExit(() => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(new Error("PTY exited before startup marker: " + transcript));
    });
  });
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

  it("executes PowerShell startup argv under real Windows ConPTY", async () => {
    if (process.platform !== "win32") return;
    const shell = await resolvePowerShellForConPty();
    const args = buildHostStartupArgs(shell, ["-NoLogo", "-NoProfile"],
      'Write-Output "PALMTTY_STARTUP_ARG_OK"');
    await expectPtyStartupOutput(shell, args, "PALMTTY_STARTUP_ARG_OK");
  }, 20_000);

  it("executes Unix shell startup argv under a real PTY", async () => {
    if (process.platform === "win32") return;
    const shell = await resolveExecutable("bash", { cwd: process.cwd() });
    const args = buildHostStartupArgs(shell, [], 'printf "PALMTTY_STARTUP_ARG_OK\\n"');
    await expectPtyStartupOutput(shell, args, "PALMTTY_STARTUP_ARG_OK");
  }, 20_000);
});
