// Thin client for OUR backend. The frontend never hits the upstream directly.
// Auth is a session cookie (HttpOnly) set by the backend on login, so every
// request uses `credentials: "include"` and there is no token in JS.
import type {
  Classification,
  ConfigResponse,
  Relevance,
  StatPalResponse,
  TurnsResponse,
} from "./types";

// API base. Default to same-origin under the app base path (BASE_URL is the
// Vite `base`, e.g. "/analytics/"). VITE_API_BASE can override for split deploys.
const BASE = (import.meta.env.VITE_API_BASE ?? import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Réseau indisponible — le backend est-il démarré ?");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || `Erreur serveur (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b?: unknown) => request<T>("POST", p, b);

export interface RangeBody {
  palId: string;
  from?: number;
  to?: number;
}

export const api = {
  // --- auth ---
  me: () => get<{ email: string; role: string }>("/api/auth/me"),
  login: (email: string, password: string) =>
    post<{ email: string; role: string }>("/api/auth/login", { email, password }),
  logout: () => post<{ ok: true }>("/api/auth/logout"),

  // --- data (palId scoped server-side) ---
  config: () => get<ConfigResponse>("/api/config"),
  statPal: (b: RangeBody & { excludeEmpty: boolean }) => post<StatPalResponse>("/api/stat/pal", b),
  turns: (b: RangeBody) => post<TurnsResponse>("/api/turns", b),
  classify: (palId: string, questions: string[]) =>
    post<{ results: Classification[] }>("/api/classify", { palId, questions }),
  relevance: (palId: string, pairs: { question: string; answer: string }[]) =>
    post<{ results: Relevance[] }>("/api/relevance", { palId, pairs }),

  // --- admin (STAFF only) ---
  adminClients: () => get<{ clients: AdminClient[] }>("/api/admin/clients"),
  adminCreateClient: (name: string) => post<{ client: AdminClient }>("/api/admin/clients", { name }),
  adminCreatePal: (clientId: string, palId: string, label: string) =>
    post("/api/admin/pals", { clientId, palId, label }),
  adminCreateUser: (email: string, password: string, role: string, clientId?: string) =>
    post("/api/admin/users", { email, password, role, clientId }),
};

export interface AdminClient {
  id: string;
  name: string;
  pals: { id: string; palId: string; label: string }[];
  users: { id: string; email: string; role: string }[];
}
