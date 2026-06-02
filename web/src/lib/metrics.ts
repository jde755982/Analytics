// Client-side derivations for charts and KPI cards.
import type { EnrichedTurn, RawEvent, StatSession } from "../types";

/** Unique sessions per calendar day, derived from raw events. */
export function sessionsPerDay(events: RawEvent[]): { day: string; sessions: number }[] {
  const byDay = new Map<string, Set<string>>();
  for (const ev of events) {
    const day = new Date(ev.created).toDateString();
    const set = byDay.get(day) ?? new Set<string>();
    set.add(ev.sessionId);
    byDay.set(day, set);
  }
  return [...byDay.entries()]
    .map(([day, set]) => ({ day, sessions: set.size, ts: Date.parse(day) }))
    .sort((a, b) => a.ts - b.ts)
    .map(({ day, sessions }) => ({ day, sessions }));
}

export function eventNameDistribution(counts: Record<string, number>) {
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

const BUCKETS = [
  { label: "0–30s", min: 0, max: 30_000 },
  { label: "30s–2m", min: 30_000, max: 120_000 },
  { label: "2–5m", min: 120_000, max: 300_000 },
  { label: "5m+", min: 300_000, max: Infinity },
];

export function durationBuckets(sessions: StatSession[]) {
  const counts = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const s of sessions) {
    const i = BUCKETS.findIndex((b) => s.duration >= b.min && s.duration < b.max);
    if (i >= 0) counts[i].count++;
  }
  return counts;
}

export function questionTypeDistribution(turns: EnrichedTurn[], taxonomy: string[]) {
  const counts = new Map<string, number>();
  for (const t of turns) {
    if (t.questionType) counts.set(t.questionType, (counts.get(t.questionType) ?? 0) + 1);
  }
  // Keep taxonomy order; append any extras (e.g. "unclassified").
  const ordered = [...taxonomy, ...[...counts.keys()].filter((k) => !taxonomy.includes(k))];
  return ordered
    .filter((type) => counts.has(type))
    .map((type) => ({ type, count: counts.get(type) ?? 0 }));
}

export function relevanceHistogram(turns: EnrichedTurn[]) {
  const counts = [1, 2, 3, 4, 5].map((score) => ({ score: String(score), count: 0 }));
  for (const t of turns) {
    if (t.relevanceScore && t.relevanceScore >= 1 && t.relevanceScore <= 5) {
      counts[t.relevanceScore - 1].count++;
    }
  }
  return counts;
}

export function flagDistribution(turns: EnrichedTurn[], flags: string[]) {
  const counts = new Map<string, number>();
  for (const t of turns) {
    for (const f of t.relevanceFlags ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return flags.filter((f) => counts.has(f)).map((flag) => ({ flag, count: counts.get(flag) ?? 0 }));
}

/** Average relevance score per calendar day (scored turns only). */
export function relevancePerDay(turns: EnrichedTurn[]) {
  const byDay = new Map<string, number[]>();
  for (const t of turns) {
    if (!t.relevanceScore) continue;
    const day = new Date(t.askedAt).toDateString();
    const arr = byDay.get(day) ?? [];
    arr.push(t.relevanceScore);
    byDay.set(day, arr);
  }
  return [...byDay.entries()]
    .map(([day, scores]) => ({
      day,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      ts: Date.parse(day),
    }))
    .sort((a, b) => a.ts - b.ts)
    .map(({ day, avg }) => ({ day, avg: Number(avg.toFixed(2)) }));
}

export function avgRelevance(turns: EnrichedTurn[]): number | null {
  const scores = turns.map((t) => t.relevanceScore).filter((s): s is number => !!s && s > 0);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
