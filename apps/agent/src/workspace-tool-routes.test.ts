import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import type { WorkspaceDefinition } from "@palmtty/protocol";
import { buildApp } from "./app.js";
import { MemoryWorkspaceStore } from "./workspace-store.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const ORIGIN = "http://127.0.0.1:7688";
const roots = new Set<string>();

function config() {
  return parseConfig({
    server: {
      host: "127.0.0.1",
      port: 7688,
      trustedOrigins: [ORIGIN],
      secureCookies: false
    },
    auth: {
      enabled: true,
      tokenEnv: "PALMTTY_TEST_TOKEN",
      sessionTtlMinutes: 60
    }
  });
}

async function fixture() {
  process.env.PALMTTY_TEST_TOKEN = TOKEN;
  const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-workbench-api-"));
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-workbench-runtime-"));
  roots.add(root);
  roots.add(runtimeDir);
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "README.md"), "hello\n", "utf8");

  const workspace: WorkspaceDefinition = {
    id: "workspace-1",
    name: "Workspace",
    cwd: root,
    runtime: { kind: "host", args: [] }
  };
  const app = await buildApp(config(), {
    sessionManager: { runtimeDir },
    workspaceStore: new MemoryWorkspaceStore([workspace])
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: ORIGIN },
    payload: { token: TOKEN }
  });
  expect(login.statusCode).toBe(204);
  const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  return { app, cookie };
}

afterEach(async () => {
  delete process.env.PALMTTY_TEST_TOKEN;
  for (const root of roots) {
    await rm(root, { recursive: true, force: true });
  }
  roots.clear();
});

describe("workspace tool HTTP boundary", () => {
  it("requires authentication and exact Origin for file content requests", async () => {
    const { app, cookie } = await fixture();

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/files/list",
      headers: { origin: ORIGIN },
      payload: { path: "" }
    });
    expect(unauthenticated.statusCode).toBe(401);

    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/files/read",
      headers: { cookie, origin: "https://evil.invalid" },
      payload: { path: "README.md" }
    });
    expect(wrongOrigin.statusCode).toBe(403);

    const listing = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/files/list",
      headers: { cookie, origin: ORIGIN },
      payload: { path: "" }
    });
    expect(listing.statusCode).toBe(200);
    expect(listing.json().entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "src", kind: "directory" }),
      expect.objectContaining({ name: "README.md", kind: "file" })
    ]));

    const read = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/files/read",
      headers: { cookie, origin: ORIGIN },
      payload: { path: "README.md" }
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      path: "README.md",
      binary: false,
      content: "hello\n"
    });

    await app.close();
  });

  it("requires authentication for Git status", async () => {
    const { app, cookie } = await fixture();

    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/git/status",
      headers: { origin: ORIGIN }
    });
    expect(denied.statusCode).toBe(401);

    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/git/status",
      headers: { cookie, origin: "https://evil.invalid" }
    });
    expect(wrongOrigin.statusCode).toBe(403);

    const status = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/workspace-1/git/status",
      headers: { cookie, origin: ORIGIN }
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ available: false });

    await app.close();
  });
});
