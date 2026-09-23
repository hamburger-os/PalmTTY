import { MAX_SESSION_ARTIFACT_BYTES } from "@palmtty/protocol";
import type {
  BrowseDirectoryRequest,
  CreateWorkspaceInput,
  DirectoryListing,
  GitBranchesResponse,
  GitDiffResponse,
  GitHistoryResponse,
  GitMutationRequest,
  GitMutationResponse,
  GitRemoteRequest,
  GitRemoteResponse,
  GitStatusResponse,
  RuntimeCapabilities,
  SessionArtifact,
  SessionArtifactListResponse,
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

async function responseError(response: Response): Promise<never> {
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

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) return responseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function responseBlob(response: Response): Promise<Blob> {
  if (!response.ok) return responseError(response);
  return response.blob();
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

export async function readWorkspaceImage(
  workspaceId: string,
  path: string
) {
  return responseBlob(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files/image`,
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

export async function workspaceGitHistory(
  workspaceId: string,
  limit = 20
) {
  return responseJson<GitHistoryResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/git/history`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit })
    }
  ));
}

export async function workspaceGitBranches(workspaceId: string) {
  return responseJson<GitBranchesResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/git/branches`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}"
    }
  ));
}

export async function workspaceGitMutate(
  workspaceId: string,
  input: GitMutationRequest
) {
  return responseJson<GitMutationResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/git/mutate`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  ));
}

export async function workspaceGitRemote(
  workspaceId: string,
  input: GitRemoteRequest
) {
  return responseJson<GitRemoteResponse>(await fetch(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/git/remote`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
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

export async function listSessionArtifacts(sessionId: string) {
  return responseJson<SessionArtifactListResponse>(await fetch(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/artifacts/list`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}"
    }
  ));
}

export async function uploadSessionArtifact(
  sessionId: string,
  file: File
) {
  if (file.size < 1 || file.size > MAX_SESSION_ARTIFACT_BYTES) {
    throw new ApiError("artifact_too_large");
  }
  return responseJson<{ artifact: SessionArtifact }>(await fetch(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/artifacts/upload`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/octet-stream",
        "x-palmtty-filename": encodeURIComponent(file.name || "image")
      },
      body: file
    }
  ));
}

export async function readSessionArtifactContent(
  sessionId: string,
  artifactId: string
) {
  return responseBlob(await fetch(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}/content`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}"
    }
  ));
}

export async function deleteSessionArtifact(
  sessionId: string,
  artifactId: string
) {
  return responseJson<void>(await fetch(
    `/api/v1/sessions/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}`,
    {
      method: "DELETE",
      credentials: "same-origin"
    }
  ));
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
