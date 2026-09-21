import { describe, expect, it } from "vitest";
import {
  BrowseDirectoryRequestSchema,
  CreateSessionSchema,
  CreateWorkspaceSchema,
  MAX_INPUT_BYTES,
  WorkspaceDefinitionSchema,
  isActiveSessionState,
  isTerminalSessionState,
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

  it("parses bounded Host and WSL directory browse requests", () => {
    expect(BrowseDirectoryRequestSchema.parse({ kind: "host" })).toEqual({
      kind: "host"
    });
    expect(BrowseDirectoryRequestSchema.parse({
      kind: "wsl",
      distribution: "Ubuntu-24.04",
      path: "/home/dev"
    })).toEqual({
      kind: "wsl",
      distribution: "Ubuntu-24.04",
      path: "/home/dev"
    });
  });

  it("requires a WSL shell when shell arguments are configured", () => {
    expect(() => CreateWorkspaceSchema.parse({
      name: "Ubuntu",
      cwd: "/home/dev/project",
      runtime: { kind: "wsl", args: ["-l"] }
    })).toThrow();
  });

  it("classifies active and terminal session states", () => {
    expect(isActiveSessionState("starting")).toBe(true);
    expect(isActiveSessionState("running")).toBe(true);
    expect(isActiveSessionState("stopping")).toBe(true);
    expect(isActiveSessionState("exited")).toBe(false);
    expect(isTerminalSessionState("exited")).toBe(true);
    expect(isTerminalSessionState("failed")).toBe(true);
    expect(isTerminalSessionState("stopping")).toBe(false);
  });

  it("rejects oversized terminal dimensions", () => {
    expect(() => CreateSessionSchema.parse({ workspaceId: "x", cols: 501, rows: 24 })).toThrow();
  });

  it("rejects oversized terminal input", () => {
    const data = "x".repeat(MAX_INPUT_BYTES + 1);
    expect(() => parseClientMessage(JSON.stringify({ type: "input", data }))).toThrow();
  });

  it("requires the recovery geometry in resume messages", () => {
    expect(parseClientMessage('{"type":"resume","lastSeq":9,"cols":120,"rows":35}')).toEqual({
      type: "resume",
      lastSeq: 9,
      cols: 120,
      rows: 35
    });
    expect(() => parseClientMessage('{"type":"resume","lastSeq":9}')).toThrow();
    expect(() => parseClientMessage('{"type":"resume","lastSeq":9,"cols":501,"rows":35}')).toThrow();
  });
});
