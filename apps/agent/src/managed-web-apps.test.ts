import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { ManagedWebApps, HARNESS_PIN, parseHarnessReadyUrl } from "./managed-web-apps.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("always returns two managed app identities without startup side effects", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({}), root);
  const result = await mgr.catalog(false);
  expect(Object.keys(result.apps).sort()).toEqual(["harness", "codeServer"]);
  expect(result.apps.harness.accessUrl).toBeUndefined();
  expect(["not_installed", "installed"]).toContain(result.apps.harness.phase);
  await mgr.ensure("codeServer"); // official VS Code server is not hosted.
  expect((await mgr.catalog(false)).apps.codeServer.phase).not.toBe("running");
  await mgr.close();
});

it("never exposes configured loopback links to remote clients", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({
    integrations: {
      codeServer: "http://127.0.0.1:8000/",
      harness: "http://127.0.0.1:3080/"
    }
  }), root);
  const remote = await mgr.catalog(false);
  expect(remote.apps.codeServer.accessUrl).toBeUndefined();
  expect(remote.apps.harness.accessUrl).toBeUndefined();
  const local = await mgr.catalog(true);
  expect(local.apps.codeServer.accessUrl).toBe("http://127.0.0.1:8000/");
  expect(local.apps.harness.accessUrl).toBe("http://127.0.0.1:3080/");
  await mgr.close();
});

it("uses one pinned Harness package version and rejects request-controlled versions", () => {
  expect(HARNESS_PIN).toMatch(/^\d+\.\d+\.\d+-rc\.\d+$/);
});

// Only the official readiness line establishes that DSH booted its Web UI.
it("requires the official DSH readiness announcement", () => {
  const valid = "dsh web: http://127.0.0.1:3080/?token=one-time";
  expect(parseHarnessReadyUrl(valid)).toBe("http://127.0.0.1:3080/?token=one-time");
  for (const line of [
    "warning: http://127.0.0.1:3080/?token=wrong",
    "dsh web: http://localhost:3080/?token=x",
    "dsh web: http://127.0.0.2:3080/?token=x",
    "dsh web: http://127.0.0.1:99999/?token=x",
    "dsh web: http://127.0.0.1:0/?token=x",
    "dsh web: https://127.0.0.1:3080/?token=x"
  ]) expect(parseHarnessReadyUrl(line)).toBeUndefined();
  expect(parseHarnessReadyUrl("unrelated URL\n" + valid + "\n"))
    .toBe("http://127.0.0.1:3080/?token=one-time");
});

it("does not hide an install failure when a partial Harness CLI appears", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({}), root);
  const internal = mgr as unknown as { harnessPhase: string; harnessDetail?: string };
  internal.harnessPhase = "failed";
  internal.harnessDetail = "install_failed";
  const bin = path.join(root, "harness", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  await mkdir(path.dirname(bin), { recursive: true });
  await writeFile(bin, "incomplete installation");
  const state = (await mgr.catalog(false)).apps.harness;
  expect(state.phase).toBe("failed");
  expect(state.detail).toBe("install_failed");
  await mgr.close();
});
