const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

let onNonAutorise: (() => void) | null = null;

/** Permet à AuthContext de brancher une réaction (déconnexion) sur les 401. */
export function definirReactionNonAutorise(fn: () => void) {
  onNonAutorise = fn;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  });

  if (res.status === 401) {
    onNonAutorise?.();
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export function pdfUrl(factureId: number) {
  // Le PDF est ouvert via un lien <a>, sans passer par fetch : on doit
  // donc transmettre le token en paramètre d'URL pour cette seule route.
  const token = getToken();
  return `${API_URL}/factures/${factureId}/pdf?access_token=${encodeURIComponent(token || "")}`;
}
