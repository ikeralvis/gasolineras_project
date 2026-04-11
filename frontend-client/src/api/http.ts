const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  // Auto-apply JSON header when body is plain text/json payload.
  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });
}

export async function apiFetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = (body as { detail?: string; error?: string })?.detail
      ?? (body as { detail?: string; error?: string })?.error
      ?? `Request failed with status ${response.status}`;
    throw new Error(detail);
  }

  return response.json() as Promise<T>;
}

export { API_BASE_URL };
