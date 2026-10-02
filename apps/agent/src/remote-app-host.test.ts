import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveRemoteAppHost, sourceRemoteAppHostFilename } from "./remote-app-host.js";

describe("source Windows Remote App helper cache", () => {
  it("uses a deterministic content and compiler-options fingerprint", () => {
    const first = Buffer.from("class Host { static void Main() {} }");
    const name = sourceRemoteAppHostFilename(first);
    expect(name).toMatch(/^palmtty-remote-app-host-[a-f0-9]{16}\.exe$/);
    expect(sourceRemoteAppHostFilename(Buffer.from(first))).toBe(name);
  });

  it.skipIf(process.platform !== "win32")(
    "compiles the exact source fingerprint and runs the native failure path",
    async () => {
      const sourcePath = fileURLToPath(
        new URL("../../../scripts/windows-remote-app-host.cs", import.meta.url)
      );
      const source = await readFile(sourcePath);
      const helper = await resolveRemoteAppHost();
      expect(path.basename(helper)).toBe(sourceRemoteAppHostFilename(source));

      const child = spawn(helper, [], {
        windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      const result = new Promise<number | null>((resolve, reject) => {
        const deadline = setTimeout(() => {
          child.kill();
          reject(new Error("Source-mode native Host failure smoke timed out"));
        }, 8_000);
        child.once("error", (error) => {
          clearTimeout(deadline);
          reject(error);
        });
        child.once("close", (code) => {
          clearTimeout(deadline);
          resolve(code);
        });
      });
      child.stdin.end(JSON.stringify({
        kind: "packaged", appUserModelId: "InvalidAumid",
        packageFamilyName: "InvalidPackage",
        cwd: process.cwd(), args: [], frameRate: 12,
        maxWidth: 1280, maxHeight: 800
      }) + "\n");
      expect(await result).toBe(1);
      expect(stderr).toMatch(
        /PALMTTY_APP_HOST_ERROR stage=validate-profile type=InvalidDataException hresult=0x[0-9A-F]{8}/
      );
      const geometry = spawnSync(helper, ["--geometry-self-test"], {
        windowsHide: true, encoding: "utf8", timeout: 8_000
      });
      expect(geometry.error).toBeUndefined();
      expect(geometry.status).toBe(0);
      expect(geometry.stdout).toContain("work-area and DWM crop geometry: passed");
    },
    60_000
  );

  it("never reuses the previous compiled host when C# source changes", () => {
    const old = sourceRemoteAppHostFilename(Buffer.from("class Host { }"));
    const next = sourceRemoteAppHostFilename(Buffer.from("class Host { static int V = 2; }"));
    expect(next).not.toBe(old);
  });
});
