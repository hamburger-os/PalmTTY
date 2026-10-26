import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnOwnedProcess } from "./owned-process.js";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { WEB_APP_IDS } from "@palmtty/protocol";
import { ManagedWebApps, HARNESS_PIN, isPinnedHarnessPackage, parseHarnessReadyUrl } from "./managed-web-apps.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it("always returns two managed app identities without startup side effects", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({}), root);
  const result = await mgr.catalog(false);
  expect(Object.keys(result.apps).sort()).toEqual([...WEB_APP_IDS].sort());
  expect(result.apps.harness.accessUrl).toBeUndefined();
  expect(result.apps.harness.phase).toBe("disabled");
  await mgr.ensure("vscodeWeb"); // Absent configuration cannot grant launch authority.
  expect((await mgr.catalog(false)).apps.vscodeWeb.phase).not.toBe("running");
  await mgr.close();
});

it("never exposes configured loopback links to remote clients", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({
    integrations: {
      vscodeWeb: { mode: "external", url: "http://127.0.0.1:8000/" },
      harness: { mode: "external", url: "http://127.0.0.1:3080/" }
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
  expect(parseHarnessReadyUrl(valid)).toBeUndefined();
  expect(parseHarnessReadyUrl(valid + "\n")).toBe("http://127.0.0.1:3080/?token=one-time");
  for (const line of [
    "warning: http://127.0.0.1:3080/?token=wrong",
    "dsh web: http://localhost:3080/?token=x",
    "dsh web: http://127.0.0.2:3080/?token=x",
    "dsh web: http://127.0.0.1:99999/?token=x",
    "dsh web: http://127.0.0.1:0/?token=x",
    "dsh web: https://127.0.0.1:3080/?token=x"
  ]) expect(parseHarnessReadyUrl(line + "\n")).toBeUndefined();
  expect(parseHarnessReadyUrl("unrelated URL\n" + valid + "\n"))
    .toBe("http://127.0.0.1:3080/?token=one-time");
});

it("does not hide an install failure when a partial Harness CLI appears", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({ integrations: { harness: { mode: "managed" } } }), root);
  const internal = mgr as unknown as { states: { harness: { phase: string; detail?: string } } };
  internal.states.harness.phase = "failed";
  internal.states.harness.detail = "install_failed";
  const bin = path.join(root, "harness", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  await mkdir(path.dirname(bin), { recursive: true });
  await writeFile(bin, "incomplete installation");
  const state = (await mgr.catalog(false)).apps.harness;
  expect(state.phase).toBe("failed");
  expect(state.detail).toBe("install_failed");
  await mgr.close();
});

it("terminates an owned Harness child and returns from close", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({}), root);
  const child = spawnOwnedProcess({ executable: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], cwd: process.cwd(), env: process.env });
  const internal = mgr as unknown as { states: { harness: { process: typeof child } } };
  internal.states.harness.process = child;
  await mgr.close();
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
});

it("rejects wrong-version or half-installed managed Harness packages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-managed-"));
  roots.push(root);
  const prefix = path.join(root, "harness");
  const pkg = path.join(prefix, "node_modules", "@deepseek-ai", "dsh");
  await mkdir(path.join(pkg, "lib"), { recursive: true });
  await writeFile(path.join(pkg, "lib", "bin.js"), "entry");
  expect(await isPinnedHarnessPackage(prefix)).toBe(false);
  await writeFile(path.join(pkg, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh", version: "0.0.0" }));
  expect(await isPinnedHarnessPackage(prefix)).toBe(false);
  await writeFile(path.join(pkg, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh", version: HARNESS_PIN }));
  expect(await isPinnedHarnessPackage(prefix)).toBe(true);
});


it("external mode never installs or starts a local application", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-external-")); roots.push(root);
  const mgr = new ManagedWebApps(parseConfig({ integrations: { harness: { mode: "external", url: "https://harness.example.test/" } } }), root);
  mgr.start(); await mgr.ensure("harness");
  const status = (await mgr.catalog(false)).apps.harness;
  expect(status.phase).toBe("external"); expect(status.canEnsure).toBe(false);
  expect(status).not.toHaveProperty("embedUrl");
  expect(await mgr.authorizationUrl("harness", false)).toBeUndefined();
  await mgr.close();
});

it("rejects partial token lines and validates configured public readiness origins", () => {
  expect(parseHarnessReadyUrl("dsh web: http://127.0.0.1:3080/?token=part")).toBeUndefined();
  expect(parseHarnessReadyUrl("dsh web: https://harness.example.test/?token=fixture\n", "https://harness.example.test"))
    .toBe("https://harness.example.test/?token=fixture");
  expect(parseHarnessReadyUrl("dsh web: https://evil.example.test/?token=fixture\n", "https://harness.example.test")).toBeUndefined();
});

it("only explicit authorization maps a process token to the configured HTTPS origin", async () => {
  const mgr = new ManagedWebApps(parseConfig({ integrations: { harness: { mode: "managed", url: "https://harness.example.test/" } } }));
  const internal = mgr as unknown as { states: { harness: { phase: string; launchUrl: string } } };
  internal.states.harness.phase = "running";
  internal.states.harness.launchUrl = "http://127.0.0.1:3080/?token=fixture-secret";
  const catalog = await mgr.catalog(false);
  expect(JSON.stringify(catalog)).not.toContain("fixture-secret");
  expect(catalog.apps.harness).not.toHaveProperty("embedUrl");
  expect(await mgr.authorizationUrl("harness", false)).toBe("https://harness.example.test/?token=fixture-secret");
  await mgr.close();
});


it("recognizes official CLI URLs without a slash or final newline, but does not accept another port", () => {
  const mgr = new ManagedWebApps(parseConfig({}));
  const parser = mgr as unknown as { parseCodeUrl(output: string, port: number): string | undefined };
  expect(parser.parseCodeUrl("Web UI available at http://127.0.0.1:8000?tkn=fixture", 8000))
    .toBe("http://127.0.0.1:8000/?tkn=fixture");
  expect(parser.parseCodeUrl("http://127.0.0.1:9000?tkn=fixture", 8000)).toBeUndefined();
});

it("hands off private HTTP Harness only through its configured independent LAN route", async () => {
  const mgr = new ManagedWebApps(parseConfig({server:{exposure:{mode:"lan"},privateGateway:{listenHost:"192.168.1.3",upstreamDns:"192.168.1.1"}},integrations:{vscodeWeb:{mode:"managed",url:"https://code.palmtty.home.arpa/"},harness:{mode:"managed",url:"http://harness.palmtty.home.arpa:3080/"}}}));
  const internal = mgr as unknown as {states:{harness:{phase:string;launchUrl:string}}};
  internal.states.harness.phase="running";
  internal.states.harness.launchUrl="http://127.0.0.1:3080/?token=fixture-secret";
  const catalog = await mgr.catalog(false);
  expect(catalog.apps.harness.accessUrl).toBe("http://harness.palmtty.home.arpa:3080/");
  expect(JSON.stringify(catalog)).not.toContain("fixture-secret");
  expect(await mgr.authorizationUrl("harness",false)).toBe("http://harness.palmtty.home.arpa:3080/?token=fixture-secret");
  await mgr.close();
});
