import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { buildApp } from "./app.js";
import { MemoryWorkspaceStore } from "./workspace-store.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const ORIGIN = "http://127.0.0.1:7688";

function testConfig() {
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

const runtimeDirs = new Set<string>();

async function buildTestApp() {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "palmtty-app-test-"));
  runtimeDirs.add(runtimeDir);
  return buildApp(testConfig(), {
    sessionManager: { runtimeDir },
    workspaceStore: new MemoryWorkspaceStore()
  });
}

async function loginCookie(app: Awaited<ReturnType<typeof buildTestApp>>): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: ORIGIN },
    payload: { token: TOKEN }
  });
  expect(login.statusCode).toBe(204);
  const setCookie = String(login.headers["set-cookie"]);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie.toLowerCase()).toContain("samesite=strict");
  return setCookie.split(";")[0]!;
}

afterEach(async () => {
  delete process.env.PALMTTY_TEST_TOKEN;
  for (const runtimeDir of runtimeDirs) {
    await rm(runtimeDir, { recursive: true, force: true });
  }
  runtimeDirs.clear();
});

describe("HTTP security boundary", () => {
  it("rejects login from an untrusted origin", async () => {
    process.env.PALMTTY_TEST_TOKEN = TOKEN;
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "https://evil.invalid" },
      payload: { token: TOKEN }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("creates an HttpOnly SameSite login session for a trusted origin", async () => {
    process.env.PALMTTY_TEST_TOKEN = TOKEN;
    const app = await buildTestApp();
    const cookie = await loginCookie(app);

    const workspaces = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: { cookie }
    });
    expect(workspaces.statusCode).toBe(200);
    expect(workspaces.json()).toEqual({ workspaces: [] });
    await app.close();
  });

  it("protects workspace mutations with authentication and exact Origin", async () => {
    process.env.PALMTTY_TEST_TOKEN = TOKEN;
    const app = await buildTestApp();

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: { origin: ORIGIN },
      payload: {
        name: "Blocked",
        cwd: process.cwd(),
        runtime: { kind: "host", shell: process.execPath, args: [] }
      }
    });
    expect(unauthenticated.statusCode).toBe(401);

    const cookie = await loginCookie(app);
    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: { cookie, origin: "https://evil.invalid" },
      payload: {
        name: "Blocked",
        cwd: process.cwd(),
        runtime: { kind: "host", shell: process.execPath, args: [] }
      }
    });
    expect(wrongOrigin.statusCode).toBe(403);

    await app.close();
  });

  it("protects and serves bounded host directory browsing", async () => {
    process.env.PALMTTY_TEST_TOKEN = TOKEN;
    const app = await buildTestApp();
    const unauthenticated = await app.inject({
      method: "POST",
      url: "/api/v1/workspace-directories/browse",
      headers: { origin: ORIGIN },
      payload: { kind: "host", path: process.cwd() }
    });
    expect(unauthenticated.statusCode).toBe(401);

    const cookie = await loginCookie(app);
    const root = await mkdtemp(path.join(os.tmpdir(), "palmtty-browse-api-"));
    runtimeDirs.add(root);
    await mkdir(path.join(root, "project"));

    const wrongOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/workspace-directories/browse",
      headers: { cookie, origin: "https://evil.invalid" },
      payload: { kind: "host", path: root }
    });
    expect(wrongOrigin.statusCode).toBe(403);

    const browsed = await app.inject({
      method: "POST",
      url: "/api/v1/workspace-directories/browse",
      headers: { cookie, origin: ORIGIN },
      payload: { kind: "host", path: root }
    });
    expect(browsed.statusCode).toBe(200);
    const canonicalRoot = await realpath(root);
    expect(browsed.json()).toMatchObject({
      currentPath: canonicalRoot,
      directories: [{
        label: "project",
        path: path.join(canonicalRoot, "project")
      }]
    });

    await app.close();
  });

  it("rejects PalmTTY control variables from workspace environment", async () => {
    process.env.PALMTTY_TEST_TOKEN = TOKEN;
    const app = await buildTestApp();
    const cookie = await loginCookie(app);
    const headers = { cookie, origin: ORIGIN };

    for (const reserved of [
      "PALMTTY_TEST_TOKEN",
      "PALMTTY_CONFIG",
      "PALMTTY_DEV_TRUSTED_ORIGINS",
      "PALMTTY_WINDOWS_SPAWN_TRACE",
      "PALMTTY_FUTURE_CONTROL"
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/workspaces",
        headers,
        payload: {
          name: "Reserved",
          cwd: process.cwd(),
          runtime: {
            kind: "host",
            shell: process.execPath,
            args: []
          },
          environment: {
            [reserved]: "must-not-be-persisted"
          }
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: "workspace_invalid"
      });
    }

    const listed = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: { cookie }
    });
    expect(listed.json()).toEqual({ workspaces: [] });
    await app.close();
  });

  it("creates, updates, and deletes a validated host workspace", async () => {
    process.env.PALMTTY_TEST_TOKEN = TOKEN;
    const app = await buildTestApp();
    const cookie = await loginCookie(app);
    const headers = { cookie, origin: ORIGIN };

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers,
      payload: {
        name: "Local",
        cwd: process.cwd(),
        runtime: {
          kind: "host",
          shell: process.execPath,
          args: []
        },
        environment: {
          HTTPS_PROXY: "http://127.0.0.1:10808"
        }
      }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().workspace.environment).toEqual({
      HTTPS_PROXY: "http://127.0.0.1:10808"
    });
    const id = created.json().workspace.id as string;

    const updated = await app.inject({
      method: "PUT",
      url: `/api/v1/workspaces/${id}`,
      headers,
      payload: {
        name: "Renamed",
        cwd: process.cwd(),
        runtime: {
          kind: "host",
          shell: process.execPath,
          args: []
        }
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().workspace.name).toBe("Renamed");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/workspaces/${id}`,
      headers
    });
    expect(deleted.statusCode).toBe(204);
    await app.close();
  });
});
