import type { SessionPublic, WorkspacePublic } from "@palmtty/protocol";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = `http_${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) code = body.error;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(code);
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

export async function listWorkspaces() {
  return responseJson<{ workspaces: WorkspacePublic[] }>(
    await fetch("/api/v1/workspaces", { credentials: "same-origin" })
  );
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
  return responseJson<void>(await fetch(`/api/v1/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin"
  }));
}
