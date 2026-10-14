export class WorkspaceApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WorkspaceApiError";
  }
}

export async function workspaceApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json() as { message?: string | string[] };
      if (typeof body.message === "string") message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(" ");
    } catch {
      // Keep the status-based message when the response has no JSON body.
    }
    throw new WorkspaceApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
