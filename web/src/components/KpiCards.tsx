import { mean, median, msToClock } from "../lib/format";
import type { EnrichedTurn, StatPalResponse } from "../types";
import { avgRelevance, pctCoherent, pctQuestionType } from "../lib/metrics";

interface Props {
  stats: StatPalResponse;
  totalEvents: number;
  turns: EnrichedTurn[];
  // Taxonomy label counted as "order-related" questions (from config).
  orderType?: string;
  // Share of interactions that came in by voice (0..1), or null if unknown.
  voiceShare?: number | null;
}

function Card({ value, label }: { value: string; label: string }) {
  return (
    <div className="kpi">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

const pct = (v: number | null) => (v != null ? `${v.toFixed(0)}%` : "—");

export function KpiCards({
  stats,
  totalEvents,
  turns,
  orderType = "Commande & suivi",
  voiceShare = null,
}: Props) {
  const durations = stats.sessions.map((s) => s.duration);
  const avgRel = avgRelevance(turns);
  return (
    <div className="kpis">
      <Card value={String(stats.totalSessions)} label="Sessions totales" />
      <Card value={String(stats.totalNonEmptySessions)} label="Sessions non vides" />
      <Card value={String(totalEvents)} label="Événements totaux" />
      <Card value={String(turns.length)} label="Tours Q/R" />
      <Card value={msToClock(mean(durations))} label="Durée moy. (mm:ss)" />
      <Card value={msToClock(median(durations))} label="Durée médiane (mm:ss)" />
      <Card value={pct(voiceShare != null ? voiceShare * 100 : null)} label="% interactions vocales" />
      <Card value={avgRel != null ? avgRel.toFixed(2) : "—"} label="Pertinence moy. (1–5)" />
      <Card value={pct(pctCoherent(turns))} label="% réponses cohérentes (≥4/5)" />
      <Card value={pct(pctQuestionType(turns, orderType))} label={`% questions « ${orderType} »`} />
    </div>
  );
}
