import { upstream } from "../config.js";

/** Raw event envelope as returned by the upstream StarPal API. */
export interface RawEvent {
  sessionId: string;
  eventName: string;
  eventData: unknown;
  created: number; // Unix ms
}

export interface ExportResponse {
  events: RawEvent[];
}

export interface StatSession {
  id: string;
  firstEventCreated: number;
  lastEventCreated: number;
  numEvents: number;
  duration: number; // ms
}

export interface StatPalResponse {
  sessions: StatSession[];
  totalSessions: number;
  totalNonEmptySessions: number;
}

export interface PalRange {
  palId: string;
  from?: number;
  to?: number;
}

/** Distinguishes "no data for this Pal/range" (404) from real failures. */
export class UpstreamEmptyError extends Error {
  constructor(public readonly endpoint: string) {
    super(`No data (404) from ${endpoint}`);
    this.name = "UpstreamEmptyError";
  }
}

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${upstream.baseUrl}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Upstream returns 404 when there is simply no data for the Pal/range.
  if (res.status === 404) throw new UpstreamEmptyError(endpoint);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream ${endpoint} failed: ${res.status} ${res.statusText} ${text}`.trim());
  }
  return (await res.json()) as T;
}

export function statPal(
  body: PalRange & { excludeEmpty?: boolean },
): Promise<StatPalResponse> {
  return post<StatPalResponse>("/stat/pal", body);
}

export function statExport(body: PalRange): Promise<ExportResponse> {
  return post<ExportResponse>("/stat/export", body);
}
