import { describe, expect, it } from "vitest";
import {
  CreateSessionSchema,
  CreateWorkspaceSchema,
  MAX_INPUT_BYTES,
  WorkspaceDefinitionSchema,
  parseClientMessage
} from "./index.js";

describe("protocol", () => {
  it("accepts a valid session request", () => {
    expect(CreateSessionSchema.parse({ workspaceId: "palmtty" })).toEqual({
      workspaceId: "palmtty",
      cols: 80,
      rows: 24
    });
  });

  it("parses host and WSL workspace definitions", () => {
    expect(WorkspaceDefinitionSchema.parse({
      id: "host-1",
      name: "Host",
      cwd: "/workspace",
      runtime: { kind: "host" }
    }).runtime).toEqual({ kind: "host", args: [] });

    expect(CreateWorkspaceSchema.parse({
      name: "Ubuntu",
      cwd: "/home/dev/project",
      runtime: {
        kind: "wsl",
        distribution: "Ubuntu",
        shell: "/bin/bash",
        args: ["-l"]
      }
    }).runtime.kind).toBe("wsl");
  });

  it("requires a WSL shell when shell arguments are configured", () => {
    expect(() => CreateWorkspaceSchema.parse({
      name: "Ubuntu",
      cwd: "/home/dev/project",
      runtime: { kind: "wsl", args: ["-l"] }
    })).toThrow();
  });

  it("rejects oversized terminal dimensions", () => {
    expect(() => CreateSessionSchema.parse({ workspaceId: "x", cols: 501, rows: 24 })).toThrow();
  });

  it("rejects oversized terminal input", () => {
    const data = "x".repeat(MAX_INPUT_BYTES + 1);
    expect(() => parseClientMessage(JSON.stringify({ type: "input", data }))).toThrow();
  });

  it("parses resume messages", () => {
    expect(parseClientMessage('{"type":"resume","lastSeq":9}')).toEqual({
      type: "resume",
      lastSeq: 9
    });
  });
});
