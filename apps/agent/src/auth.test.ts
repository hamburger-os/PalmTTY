import { describe, expect, it } from "vitest";
import { parseConfig } from "@palmtty/config";
import { AuthService } from "./auth.js";

function authConfig() {
  return parseConfig({
    auth: {
      enabled: true,
      tokenEnv: "TEST_TOKEN",
      maxLoginSessions: 2,
      sessionTtlMinutes: 5
    },
    workspaces: [{ id: "main", name: "Main", cwd: "C:\\Code" }]
  }).auth;
}

describe("authentication", () => {
  it("accepts the configured token and creates a login session", () => {
    const auth = new AuthService(authConfig(), { TEST_TOKEN: "0123456789abcdef0123456789abcdef" });
    expect(auth.verifyToken("client", "bad-token")).toBe(false);
    expect(auth.verifyToken("client", "0123456789abcdef0123456789abcdef")).toBe(true);
    const session = auth.createLoginSession(1_000);
    expect(auth.isAuthenticated(session, 1_001)).toBe(true);
  });

  it("expires login sessions", () => {
    const auth = new AuthService(authConfig(), { TEST_TOKEN: "0123456789abcdef0123456789abcdef" });
    const session = auth.createLoginSession(1_000);
    expect(auth.isAuthenticated(session, 1_000 + 5 * 60_000 + 1)).toBe(false);
  });

  it("bounds active login sessions and evicts the oldest", () => {
    const auth = new AuthService(authConfig(), { TEST_TOKEN: "0123456789abcdef0123456789abcdef" });
    const first = auth.createLoginSession(1_000);
    const second = auth.createLoginSession(1_001);
    const third = auth.createLoginSession(1_002);
    expect(auth.isAuthenticated(first, 1_003)).toBe(false);
    expect(auth.isAuthenticated(second, 1_003)).toBe(true);
    expect(auth.isAuthenticated(third, 1_003)).toBe(true);
  });

  it("reports remaining login lifetime", () => {
    const auth = new AuthService(authConfig(), { TEST_TOKEN: "0123456789abcdef0123456789abcdef" });
    const session = auth.createLoginSession(1_000);
    expect(auth.remainingSessionMs(session, 1_001)).toBe(5 * 60_000 - 1);
  });

  it("refuses short bootstrap secrets", () => {
    expect(() => new AuthService(authConfig(), { TEST_TOKEN: "short" })).toThrow();
  });
});
