import { describe, expect, it } from "vitest";
import {
  BrowseDirectoryRequestSchema,
  CreateSessionSchema,
  GitDiffRequestSchema,
  GitHistoryRequestSchema,
  GitMutationRequestSchema,
  GitRemoteRequestSchema,
  SessionArtifactSchema,
  WorkspaceFileImageRequestSchema,
  WorkspaceFileListRequestSchema,
  WorkspaceFileReadRequestSchema,
  DetectTerminalProfilesRequestSchema,
  TerminalProfileSchema,
  CreateWorkspaceSchema,
  MAX_INPUT_BYTES,
  WorkspaceDefinitionSchema,
  WorkspaceEnvironmentSchema,
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

  it("parses bounded workspace environment and terminal profiles", () => {
    expect(WorkspaceEnvironmentSchema.parse({
      HTTPS_PROXY: "http://127.0.0.1:10808",
      HTTP_PROXY: "http://127.0.0.1:10808"
    })).toMatchObject({
      HTTPS_PROXY: "http://127.0.0.1:10808"
    });
    expect(() => WorkspaceEnvironmentSchema.parse({
      TERM: "xterm"
    })).toThrow();
    expect(() => WorkspaceEnvironmentSchema.parse({
      Path: "one",
      PATH: "two"
    })).toThrow();

    expect(DetectTerminalProfilesRequestSchema.parse({})).toEqual({});
    expect(() => DetectTerminalProfilesRequestSchema.parse({ kind: "host" }))
      .toThrow();

    expect(TerminalProfileSchema.parse({
      id: "wsl:Ubuntu-24.04",
      label: "Ubuntu-24.04",
      runtime: {
        kind: "wsl",
        distribution: "Ubuntu-24.04",
        args: []
      },
      recommended: false
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

  it("keeps workbench file and Git paths bounded", () => {
    expect(WorkspaceFileListRequestSchema.parse({})).toEqual({ path: "" });
    expect(WorkspaceFileListRequestSchema.parse({ path: "apps/web/src" })).toEqual({
      path: "apps/web/src"
    });
    expect(WorkspaceFileReadRequestSchema.parse({ path: "README.md" })).toEqual({
      path: "README.md"
    });
    expect(() => WorkspaceFileListRequestSchema.parse({ path: "../secret" })).toThrow();
    expect(() => WorkspaceFileListRequestSchema.parse({ path: "/etc" })).toThrow();
    expect(() => WorkspaceFileListRequestSchema.parse({ path: "C:/Windows" })).toThrow();
    expect(() => WorkspaceFileListRequestSchema.parse({ path: "src\\index.ts" })).toThrow();
    expect(() => WorkspaceFileListRequestSchema.parse({ path: "src//index.ts" })).toThrow();
    expect(() => WorkspaceFileReadRequestSchema.parse({ path: "" })).toThrow();
    expect(WorkspaceFileImageRequestSchema.parse({ path: "shot.png" })).toEqual({
      path: "shot.png"
    });

    expect(SessionArtifactSchema.parse({
      id: "abcdefghijklmnop",
      name: "shot.png",
      mime: "image/png",
      size: 128,
      width: 64,
      height: 32,
      createdAt: "2026-09-24T00:00:00.000Z",
      terminalPath: "/tmp/shot.png"
    }).mime).toBe("image/png");
    expect(() => SessionArtifactSchema.parse({
      id: "bad/id",
      name: "shot.svg",
      mime: "image/svg+xml",
      size: 128,
      width: 64,
      height: 32,
      createdAt: "2026-09-24T00:00:00.000Z",
      terminalPath: "/tmp/shot.svg"
    })).toThrow();

    expect(GitDiffRequestSchema.parse({ path: "apps/web/src/App.tsx" })).toEqual({
      path: "apps/web/src/App.tsx",
      staged: false
    });
    expect(() => GitDiffRequestSchema.parse({ path: "../outside" })).toThrow();
    expect(() => GitDiffRequestSchema.parse({ path: "src\\index.ts" })).toThrow();

    expect(GitHistoryRequestSchema.parse({})).toEqual({ limit: 20 });
    expect(GitMutationRequestSchema.parse({
      expectedState: "a".repeat(64),
      allowRepositoryCodeExecution: true,
      operation: { type: "stage", paths: ["README.md"] }
    }).operation.type).toBe("stage");
    expect(GitMutationRequestSchema.parse({
      expectedState: "a".repeat(64),
      allowRepositoryCodeExecution: true,
      operation: { type: "stage.all" }
    }).operation.type).toBe("stage.all");
    expect(() => GitMutationRequestSchema.parse({
      expectedState: "a".repeat(64),
      allowRepositoryCodeExecution: false,
      operation: { type: "stage", paths: ["README.md"] }
    })).toThrow();
    expect(GitRemoteRequestSchema.parse({
      expectedState: "b".repeat(64),
      allowRepositoryCodeExecution: true,
      operation: "fetch"
    }).operation).toBe("fetch");
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
