import { mkdtemp, rm } from "node:fs/promises";
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
  expect(Object.keys(result.apps).sort()).toEqual(["harness", "vscodeWeb"]);
  expect(result.apps.harness.accessUrl).toBeUndefined();
  expect(["not_installed", "installed"]).toContain(result.apps.harness.phase);
  await mgr.ensure("vscodeWeb"); // official VS Code server is not hosted.
  expect((await mgr.catalog(false)).apps.vscodeWeb.phase).not.toBe("running");
  await mgr.close();
});

it("never exposes configured loopback links to remote clients", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({
    integrations: {
      vscodeWeb: "http://127.0.0.1:8000/",
      harness: "http://127.0.0.1:3080/"
    }
  }), root);
  const remote = await mgr.catalog(false);
  expect(remote.apps.vscodeWeb.accessUrl).toBeUndefined();
  expect(remote.apps.harness.accessUrl).toBeUndefined();
  const local = await mgr.catalog(true);
  expect(local.apps.vscodeWeb.accessUrl).toBe("http://127.0.0.1:8000/");
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
