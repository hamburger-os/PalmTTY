import type {
  BrowseDirectoryRequest,
  CreateWorkspaceInput,
  DirectoryListing,
  GitDiffResponse,
  GitStatusResponse,
  RuntimeCapabilities,
  SessionPublic,
  TerminalProfile,
  WorkspaceFileListResponse,
  WorkspaceFileReadResponse,
  WorkspacePublic
} from "@palmtty/protocol";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = `http_${response.status}`;
    let detail: string | undefined;
    try {
      const body = await response.json() as {
        error?: string;
        message?: string;
      };
      if (body.error) code = body.error;
      if (body.message) detail = body.message;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new ApiError(code, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function authStatus() {
  return responseJson<{ enabled: boolean; authenticated: boolean }>(
    await fetch("/api/v1/auth/status", { credentials: "same-origin" })
  );
}

export async function login(token: string) {
  return responseJson<void>(await fetch("/api/v1/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token })
  }));
}

export async function logout() {
  return responseJson<void>(await fetch("/api/v1/auth/logout", {
    method: "POST",
    credentials: "same-origin"
  }));
}

export async function runtimeCapabilities() {
  return responseJson<RuntimeCapabilities>(
    await fetch("/api/v1/capabilities", { credentials: "same-origin" })
  );
}

export async function detectTerminalProfiles() {
  return responseJson<{ profiles: TerminalProfile[] }>(await fetch(
    "/api/v1/terminal-profiles",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}"
    }
  ));
}

export async function browseWorkspaceDirectory(
  input: BrowseDirectoryRequest
) {
  return responseJson<DirectoryListing>(await fetch(
    "/api/v1/workspace-directories/browse",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  ));
}

export async function listWorkspaceFiles(
  workspaceId: string,
  path: string
) {
  return responseJson<WorkspaceFileListResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files/list`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path })
    }
  ));
}

export async function readWorkspaceFile(
  workspaceId: string,
  path: string
) {
  return responseJson<WorkspaceFileReadResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path })
    }
  ));
}

export async function workspaceGitStatus(workspaceId: string) {
  return responseJson<GitStatusResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/git/status`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}"
    }
  ));
}

export async function workspaceGitDiff(
  workspaceId: string,
  path: string,
  staged: boolean
) {
  return responseJson<GitDiffResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/git/diff`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, staged })
    }
  ));
}

export async function listWorkspaces() {
  return responseJson<{ workspaces: WorkspacePublic[] }>(
    await fetch("/api/v1/workspaces", { credentials: "same-origin" })
  );
}

export async function createWorkspace(input: CreateWorkspaceInput) {
  return responseJson<{ workspace: WorkspacePublic }>(await fetch(
    "/api/v1/workspaces",
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  ));
}

export async function updateWorkspace(
  id: string,
  input: CreateWorkspaceInput
) {
  return responseJson<{ workspace: WorkspacePublic }>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  ));
}

export async function deleteWorkspace(id: string) {
  return responseJson<void>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "same-origin"
    }
  ));
}

export async function listSessions() {
  return responseJson<{ sessions: SessionPublic[] }>(
    await fetch("/api/v1/sessions", { credentials: "same-origin" })
  );
}

export async function createSession(workspaceId: string) {
  return responseJson<{ session: SessionPublic }>(await fetch("/api/v1/sessions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId, cols: 80, rows: 24 })
  }));
}

export async function terminateSession(id: string) {
  return responseJson<{ session: SessionPublic }>(await fetch(
    `/api/v1/sessions/${encodeURIComponent(id)}/terminate`,
    {
      method: "POST",
      credentials: "same-origin"
    }
  ));
}

export async function restartSession(id: string) {
  return responseJson<{ session: SessionPublic }>(await fetch(
    `/api/v1/sessions/${encodeURIComponent(id)}/restart`,
    {
      method: "POST",
      credentials: "same-origin"
    }
  ));
}

export async function deleteSession(id: string) {
  return responseJson<void>(await fetch(
    `/api/v1/sessions/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "same-origin"
    }
  ));
}
