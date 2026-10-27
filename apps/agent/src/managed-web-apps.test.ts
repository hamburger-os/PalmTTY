import { spawnOwnedProcess } from "./owned-process.js";
import { expect, it, vi } from "vitest";
import { parseConfig } from "@palmtty/config";
import { WEB_APP_IDS } from "@palmtty/protocol";
import { ManagedWebApps, parseHarnessReadyUrl, thirdPartyEnvironment } from "./managed-web-apps.js";

it("preserves upstream shared data selection without handing PalmTTY credentials to the application", () => {
  vi.stubEnv("DSH_HOME", "shared-harness-fixture");
  vi.stubEnv("PALMTTY_ACCESS_TOKEN", "private-fixture");
  vi.stubEnv("CUSTOM_ACCESS_TOKEN", "custom-private-fixture");
  try {
    const env = thirdPartyEnvironment("CUSTOM_ACCESS_TOKEN");
    expect(env.DSH_HOME).toBe("shared-harness-fixture");
    expect(env.PALMTTY_ACCESS_TOKEN).toBeUndefined();
    expect(env.CUSTOM_ACCESS_TOKEN).toBeUndefined();
  } finally { vi.unstubAllEnvs(); }
});

it("always returns two managed app identities without startup side effects", async () => {
  const mgr = new ManagedWebApps(parseConfig({}));
  const result = await mgr.catalog(false);
  expect(Object.keys(result.apps).sort()).toEqual([...WEB_APP_IDS].sort());
  expect(result.apps.harness.accessUrl).toBeUndefined();
  expect(result.apps.harness.phase).toBe("disabled");
  await mgr.ensure("vscodeWeb"); // Absent configuration cannot grant launch authority.
  expect((await mgr.catalog(false)).apps.vscodeWeb.phase).not.toBe("running");
  await mgr.close();
});

it("never exposes configured loopback links to remote clients", async () => {
  const mgr = new ManagedWebApps(parseConfig({
    integrations: {
      vscodeWeb: { mode: "external", url: "http://127.0.0.1:8000/" },
      harness: { mode: "external", url: "http://127.0.0.1:3080/" }
    }
  }));
  const remote = await mgr.catalog(false);
  expect(remote.apps.vscodeWeb.accessUrl).toBeUndefined();
  expect(remote.apps.harness.accessUrl).toBeUndefined();
  const local = await mgr.catalog(true);
  expect(local.apps.vscodeWeb.accessUrl).toBe("http://127.0.0.1:8000/");
  expect(local.apps.harness.accessUrl).toBe("http://127.0.0.1:3080/");
  await mgr.close();
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

it("fails visibly without starting a process when the operator CLI is missing", async () => {
  const mgr=new ManagedWebApps(parseConfig({integrations:{harness:{mode:"managed"}}}),{harness:async()=>undefined,vscodeWeb:async()=>undefined});
  await mgr.ensure("harness");
  expect((await mgr.catalog(false)).apps.harness).toMatchObject({phase:"failed",detail:"harness_not_detected"});
  await mgr.close();
});

it("does not hide a startup failure when the installed CLI becomes discoverable", async () => {
  let present=false;
  const mgr=new ManagedWebApps(parseConfig({integrations:{harness:{mode:"managed"}}}),{harness:async()=>present?"installed-cli":undefined,vscodeWeb:async()=>undefined});
  await mgr.ensure("harness");present=true;
  expect((await mgr.catalog(false)).apps.harness).toMatchObject({phase:"failed",detail:"harness_not_detected"});
  await mgr.close();
});

it("terminates an owned Harness child and returns from close", async () => {
  const mgr = new ManagedWebApps(parseConfig({}));
  const child = spawnOwnedProcess({ executable: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], cwd: process.cwd(), env: process.env });
  const internal = mgr as unknown as { states: { harness: { process: typeof child } } };
  internal.states.harness.process = child;
  await mgr.close();
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
});

it("external mode never installs or starts a local application", async () => {
  const mgr = new ManagedWebApps(parseConfig({ integrations: { harness: { mode: "external", url: "https://harness.example.test/" } } }));
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

it("only explicit authorization maps Code credentials to its derived HTTPS IP entry", async () => {
  const mgr=new ManagedWebApps(parseConfig({server:{exposure:{mode:"lan"},privateGateway:{listenHost:"192.168.1.3"}},integrations:{vscodeWeb:{mode:"managed"}}}));
  const internal=mgr as unknown as {states:{vscodeWeb:{phase:string;launchUrl:string}}};
  internal.states.vscodeWeb.phase="running";internal.states.vscodeWeb.launchUrl="http://127.0.0.1:8000/?tkn=fixture-secret";
  expect(JSON.stringify(await mgr.catalog(false))).not.toContain("fixture-secret");
  expect(await mgr.authorizationUrl("vscodeWeb",false)).toBe("https://192.168.1.3/?tkn=fixture-secret");
  expect(await mgr.authorizationUrl("vscodeWeb",true)).toBe("https://192.168.1.3/?tkn=fixture-secret");
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
  const mgr = new ManagedWebApps(parseConfig({server:{exposure:{mode:"lan"},privateGateway:{listenHost:"192.168.1.3"}},integrations:{harness:{mode:"managed"}}}));
  const internal = mgr as unknown as {states:{harness:{phase:string;launchUrl:string}}};
  internal.states.harness.phase="running";
  internal.states.harness.launchUrl="http://127.0.0.1:3080/?token=fixture-secret";
  const catalog = await mgr.catalog(false);
  expect(catalog.apps.harness.accessUrl).toBe("http://192.168.1.3:3080/");
  expect(JSON.stringify(catalog)).not.toContain("fixture-secret");
  expect(await mgr.authorizationUrl("harness",false)).toBe("http://192.168.1.3:3080/?token=fixture-secret");
  await mgr.close();
});
