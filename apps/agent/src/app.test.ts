import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { buildApp } from "./app.js";

const TOKEN = "0123456789abcdef0123456789abcdef";

function testConfig() {
  return parseConfig({
    server: {
      host: "127.0.0.1",
      port: 7688,
      trustedOrigins: ["http://127.0.0.1:7688"],
      secureCookies: false
    },
    auth: {
      enabled: true,
      tokenEnv: "PALMTTY_TEST_TOKEN",
      sessionTtlMinutes: 60
    },
    workspaces: [{ id: "main", name: "Main", cwd: "C:\\Code" }]
  });
}

afterEach(() => {
  delete process.env.PALMTTY_TEST_TOKEN;
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
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "http://127.0.0.1:7688" },
      payload: { token: TOKEN }
    });
    expect(login.statusCode).toBe(204);
    const setCookie = String(login.headers["set-cookie"]);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=strict");

    const cookie = setCookie.split(";")[0];
    const workspaces = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: { cookie }
    });
    expect(workspaces.statusCode).toBe(200);
    await app.close();
  });
});
