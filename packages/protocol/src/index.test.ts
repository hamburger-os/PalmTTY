import { describe, expect, it } from "vitest";
import {
  BrowseDirectoryRequestSchema,
  CreateAppSessionSchema,
  CreateSessionSchema,
  GitCommitDiffRequestSchema,
  GitCommitRequestSchema,
  GitDiffRequestSchema,
  GitHistoryRequestSchema,
  GitMutationRequestSchema,
  GitRemoteRequestSchema,
  SessionArtifactSchema,
  WorkspaceFileContentRequestSchema,
  WorkspaceFileImageRequestSchema,
  WorkspaceFileListRequestSchema,
  WorkspaceFileReadRequestSchema,
  DetectTerminalProfilesRequestSchema,
  TerminalProfileSchema,
  CreateWorkspaceSchema,
  MAX_INPUT_BYTES,
  WorkspaceDefinitionSchema,
  WorkspaceEnvironmentSchema,
  BrowseRemoteAppExecutableRequestSchema,
  RemoteAppCapabilitiesSchema,
  RemoteAppControlMessageSchema,
  RemoteAppExecutableListingSchema,
  isActiveAppSessionState,
  isTerminalAppSessionState,
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

  it("parses bounded Remote App profiles and control messages", () => {
    const workspace = WorkspaceDefinitionSchema.parse({
      id: "host-apps",
      name: "Host apps",
      cwd: "C:\\workspace",
      terminal: { runtime: { kind: "host" } },
      remoteApps: [{
        id: "codex-desktop",
        name: "Codex Desktop",
        launch: { kind: "win32", executable: "codex.exe" }
      }]
    });
    expect(workspace.remoteApps[0]).toEqual({
      id: "codex-desktop",
      name: "Codex Desktop",
      launch: { kind: "win32", executable: "codex.exe" },
      args: []
    });
    expect(() => WorkspaceDefinitionSchema.parse({
      id: "duplicates",
      name: "Duplicates",
      cwd: "C:\\workspace",
      terminal: { runtime: { kind: "host" } },
      remoteApps: [
        { id: "app", name: "One", launch: { kind: "win32", executable: "one.exe" } },
        { id: "app", name: "Two", launch: { kind: "win32", executable: "two.exe" } }
      ]
    })).toThrow();

    expect(() => WorkspaceDefinitionSchema.parse({
      id: "oversized-app-argv",
      name: "Oversized app argv",
      cwd: "C:\\workspace",
      terminal: { runtime: { kind: "host" } },
      remoteApps: [{
        id: "app",
        name: "App",
        launch: { kind: "win32", executable: "app.exe" },
        args: Array.from({ length: 8 }, () => "x".repeat(4096))
      }]
    })).toThrow();

    expect(WorkspaceDefinitionSchema.parse({
      id: "store", name: "Store", cwd: "C:\\workspace",
      terminal: { runtime: { kind: "host" } },
      remoteApps: [{
        id: "store-codex", name: "Codex",
        launch: {
          kind: "packaged",
          packageFamilyName: "Codex_123abc",
          appUserModelId: "Codex_123abc!App"
        }
      }]
    }).remoteApps[0]?.launch.kind).toBe("packaged");
    expect(() => WorkspaceDefinitionSchema.parse({
      id: "wrong-package", name: "Invalid", cwd: "C:\\workspace",
      terminal: { runtime: { kind: "host" } },
      remoteApps: [{
        id: "app", name: "Invalid",
        launch: {
          kind: "packaged", packageFamilyName: "Other_123",
          appUserModelId: "Codex_123!App"
        }
      }]
    })).toThrow();
    expect(CreateAppSessionSchema.parse({
      workspaceId: "host-apps",
      profileId: "codex-desktop"
    })).toEqual({
      workspaceId: "host-apps",
      profileId: "codex-desktop"
    });
    expect(RemoteAppControlMessageSchema.parse({
      type: "pointer",
      action: "move",
      x: 0.5,
      y: 0.25
    })).toMatchObject({ type: "pointer", button: 0 });
    expect(() => RemoteAppControlMessageSchema.parse({
      type: "pointer",
      action: "move",
      x: 2,
      y: 0
    })).toThrow();
    expect(RemoteAppControlMessageSchema.parse({
      type: "display",
      width: 844,
      height: 390
    })).toEqual({
      type: "display",
      width: 844,
      height: 390
    });
    expect(() => RemoteAppControlMessageSchema.parse({
      type: "display",
      width: 4000,
      height: 390
    })).toThrow();
    expect(RemoteAppCapabilitiesSchema.parse({
      supported: true,
      platform: "win32",
      transport: "webrtc",
      capture: "window",
      input: "restricted",
      iceServers: [{
        urls: ["turns:relay.example.test:5349"],
        username: "user",
        credential: "credential"
      }],
      relayConfigured: true
    }).relayConfigured).toBe(true);
    expect(BrowseRemoteAppExecutableRequestSchema.parse({})).toEqual({});
    expect(RemoteAppExecutableListingSchema.parse({
      currentPath: "C:\\Tools",
      parentPath: "C:\\",
      locations: [],
      directories: [],
      executables: [{
        name: "Tool",
        launch: { kind: "win32", executable: "C:\\Tools\\Tool.exe" },
        source: "path"
      }],
      truncated: false
    }).executables).toHaveLength(1);
    expect(isActiveAppSessionState("running")).toBe(true);
    expect(isTerminalAppSessionState("exited")).toBe(true);
  });

  it("parses host and WSL workspace definitions", () => {
    expect(WorkspaceDefinitionSchema.parse({
      id: "host-1",
      name: "Host",
      cwd: "/workspace",
      terminal: { runtime: { kind: "host" } }
    }).terminal.runtime).toEqual({ kind: "host", args: [] });

    expect(CreateWorkspaceSchema.parse({
      name: "Ubuntu",
      cwd: "/home/dev/project",
      terminal: {
        runtime: {
          kind: "wsl",
          distribution: "Ubuntu",
          shell: "/bin/bash",
          args: ["-l"]
        }
      }
    }).terminal.runtime.kind).toBe("wsl");
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
    expect(WorkspaceFileContentRequestSchema.parse({ path: "chapter.md" })).toEqual({
      path: "chapter.md"
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

    expect(GitHistoryRequestSchema.parse({})).toEqual({ limit: 30 });
    expect(GitHistoryRequestSchema.parse({
      limit: 10,
      cursor: "cursor-token",
      path: "chapters/0009.md"
    })).toEqual({
      limit: 10,
      cursor: "cursor-token",
      path: "chapters/0009.md"
    });
    expect(() => GitHistoryRequestSchema.parse({
      path: "../outside"
    })).toThrow();
    expect(GitCommitRequestSchema.parse({
      oid: "a".repeat(40)
    }).oid).toBe("a".repeat(40));
    expect(GitCommitDiffRequestSchema.parse({
      oid: "b".repeat(40),
      path: "chapters/0009.md"
    }).path).toBe("chapters/0009.md");
    expect(() => GitCommitDiffRequestSchema.parse({
      oid: "b".repeat(40),
      path: "../outside"
    })).toThrow();
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
      terminal: { runtime: { kind: "wsl", args: ["-l"] } }
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
