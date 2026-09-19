import { describe, expect, it } from "vitest";
import { parseConfig } from "./index.js";

describe("configuration", () => {
  it("applies safe local defaults", () => {
    const config = parseConfig({
      workspaces: [{ id: "main", name: "Main", cwd: "C:\\Code", shell: "pwsh" }]
    });
    expect(config.server.host).toBe("127.0.0.1");
    expect(config.auth.enabled).toBe(true);
    expect(config.sessions.maxSessions).toBe(8);
    expect(config.sessions.exitedRetentionMinutes).toBe(30);
  });

  it("rejects duplicate workspace ids", () => {
    expect(() => parseConfig({
      workspaces: [
        { id: "same", name: "A", cwd: "C:\\A" },
        { id: "same", name: "B", cwd: "C:\\B" }
      ]
    })).toThrow();
  });

  it("requires a path for custom shells", () => {
    expect(() => parseConfig({
      workspaces: [{ id: "x", name: "X", cwd: "C:\\X", shell: "custom" }]
    })).toThrow();
  });
});
