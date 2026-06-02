import { mean, median, msToClock } from "../lib/format";
import type { EnrichedTurn, StatPalResponse } from "../types";
import { avgRelevance } from "../lib/metrics";

interface Props {
  stats: StatPalResponse;
  totalEvents: number;
  turns: EnrichedTurn[];
}

function Card({ value, label }: { value: string; label: string }) {
  return (
    <div className="kpi">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export function KpiCards({ stats, totalEvents, turns }: Props) {
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
      <Card value={avgRel != null ? avgRel.toFixed(2) : "—"} label="Pertinence moy. (1–5)" />
    </div>
  );
}
