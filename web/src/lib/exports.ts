// Export builders. All exports operate on the CURRENT filtered data the caller
// passes in (respecting palId + date range + filters held in App state).
import type { EnrichedTurn, RawEvent } from "../types";
import { iso } from "./format";

/** RFC-4180-ish escaping: wrap in quotes and double internal quotes when the
 * field contains a comma, quote, CR or LF. */
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}

export function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Requirement 1 — conversation log CSV. The last three columns are blank
 * until classification / relevance have run for a given turn. */
export function turnsToCsv(turns: EnrichedTurn[]): string {
  const headers = [
    "sessionId",
    "askedAt_iso",
    "question",
    "answeredAt_iso",
    "answer",
    "latency_ms",
    "questionType",
    "relevanceScore",
    "relevanceFlags",
  ];
  const rows = turns.map((t) => [
    t.sessionId,
    iso(t.askedAt),
    t.question,
    iso(t.answeredAt),
    t.answer ?? "",
    t.answeredAt != null ? t.answeredAt - t.askedAt : "",
    t.questionType ?? "",
    t.relevanceScore ?? "",
    (t.relevanceFlags ?? []).join("|"),
  ]);
  return toCsv(headers, rows);
}

export function turnsToJson(turns: EnrichedTurn[]): string {
  return JSON.stringify(turns, null, 2);
}

/** Per-session full transcript (human-readable), all sessions concatenated. */
export function transcriptText(turns: EnrichedTurn[]): string {
  const bySession = new Map<string, EnrichedTurn[]>();
  for (const t of turns) {
    const arr = bySession.get(t.sessionId) ?? [];
    arr.push(t);
    bySession.set(t.sessionId, arr);
  }
  const blocks: string[] = [];
  for (const [sessionId, list] of bySession) {
    list.sort((a, b) => a.askedAt - b.askedAt);
    const lines = [`=== Session ${sessionId} ===`];
    for (const t of list) {
      lines.push(`[${iso(t.askedAt)}] Utilisateur: ${t.question}`);
      lines.push(
        t.answer != null
          ? `[${iso(t.answeredAt)}] Agent: ${t.answer}`
          : `(aucune réponse)`,
      );
      lines.push("");
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n");
}

/** Raw-event export for debugging. */
export function rawEventsToCsv(events: RawEvent[]): string {
  const headers = ["sessionId", "eventName", "created_iso", "eventData_json"];
  const rows = events.map((e) => [
    e.sessionId,
    e.eventName,
    iso(e.created),
    JSON.stringify(e.eventData ?? null),
  ]);
  return toCsv(headers, rows);
}
