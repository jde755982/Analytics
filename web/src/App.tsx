import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, ApiError } from "./api";
import { Banner } from "./components/Banner";
import {
  DurationBucketsChart,
  EventNameChart,
  FlagBarChart,
  QuestionTypeChart,
  RelevanceHistogramChart,
  RelevanceTrendChart,
  SessionsPerDayChart,
} from "./components/Charts";
import { KpiCards } from "./components/KpiCards";
import { SessionsTable } from "./components/SessionsTable";
import { TurnBadges } from "./components/TurnBadges";
import { Admin } from "./components/Admin";
import { TopBar } from "./components/TopBar";
import { useAuth } from "./auth/AuthContext";
import {
  download,
  rawEventsToCsv,
  transcriptText,
  turnsToCsv,
  turnsToJson,
} from "./lib/exports";
import {
  durationBuckets,
  eventNameDistribution,
  flagDistribution,
  questionTypeDistribution,
  relevanceHistogram,
  relevancePerDay,
  sessionsPerDay,
} from "./lib/metrics";
import type {
  Classification,
  EnrichedTurn,
  QueryParams,
  Relevance,
} from "./types";

const relKey = (q: string, a: string) => `${q}\n${a}`;

async function runInChunks<T>(
  items: T[],
  size: number,
  onProgress: (done: number, total: number) => void,
  fn: (chunk: T[]) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size));
    onProgress(Math.min(i + size, items.length), items.length);
  }
}

export default function App() {
  const [params, setParams] = useState<QueryParams | null>(null);
  const [classMap, setClassMap] = useState<Map<string, Classification>>(new Map());
  const [relMap, setRelMap] = useState<Map<string, Relevance>>(new Map());
  const [classifying, setClassifying] = useState<{ done: number; total: number } | null>(null);
  const [scoring, setScoring] = useState<{ done: number; total: number } | null>(null);
  const [sampleN, setSampleN] = useState(25);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  const { logout } = useAuth();
  const config = useQuery({ queryKey: ["config"], queryFn: api.config });
  const pals = config.data?.pals ?? [];
  const role = config.data?.role;

  const statQuery = useQuery({
    queryKey: ["stat", params],
    queryFn: () => api.statPal(params!),
    enabled: !!params,
  });
  const turnsQuery = useQuery({
    queryKey: ["turns", params],
    queryFn: () => api.turns(params!),
    enabled: !!params,
  });

  const onLoad = (p: QueryParams) => {
    // New range/Pal -> clear local enrichment so stale results don't bleed in.
    setClassMap(new Map());
    setRelMap(new Map());
    setSelectedType(null);
    setReviewOnly(false);
    setActionError(null);
    setParams(p);
  };

  const baseTurns = turnsQuery.data?.turns ?? [];

  const enrichedTurns: EnrichedTurn[] = useMemo(
    () =>
      baseTurns.map((t) => {
        const c = classMap.get(t.question);
        const r = t.answer != null ? relMap.get(relKey(t.question, t.answer)) : undefined;
        return {
          ...t,
          questionType: c?.type,
          relevanceScore: r?.score && r.score > 0 ? r.score : undefined,
          relevanceFlags: r?.flags,
          relevanceNote: r?.note,
        };
      }),
    [baseTurns, classMap, relMap],
  );

  const taxonomy = config.data?.taxonomy ?? [];
  const flags = config.data?.relevanceFlags ?? [];
  const anthropicEnabled = config.data?.anthropicEnabled ?? false;

  // ---- Classification ----
  const runClassify = async () => {
    setActionError(null);
    const distinct = [...new Set(baseTurns.map((t) => t.question))];
    setClassifying({ done: 0, total: distinct.length });
    try {
      const next = new Map(classMap);
      await runInChunks(distinct, 50, (done, total) => setClassifying({ done, total }), async (chunk) => {
        const { results } = await api.classify(params!.palId, chunk);
        chunk.forEach((q, i) => results[i] && next.set(q, results[i]));
        setClassMap(new Map(next));
      });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Échec de la classification");
    } finally {
      setClassifying(null);
    }
  };

  // ---- Relevance scoring ----
  const scorablePairs = useMemo(
    () =>
      baseTurns
        .filter((t) => t.answer != null)
        .map((t) => ({ question: t.question, answer: t.answer as string })),
    [baseTurns],
  );

  const runScore = async (all: boolean) => {
    setActionError(null);
    const pending = scorablePairs.filter((p) => !relMap.has(relKey(p.question, p.answer)));
    const target = all ? pending : pending.slice(0, sampleN);
    if (target.length === 0) return;
    setScoring({ done: 0, total: target.length });
    try {
      const next = new Map(relMap);
      await runInChunks(target, 24, (done, total) => setScoring({ done, total }), async (chunk) => {
        const { results } = await api.relevance(params!.palId, chunk);
        chunk.forEach((p, i) => results[i] && next.set(relKey(p.question, p.answer), results[i]));
        setRelMap(new Map(next));
      });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Échec du scoring");
    } finally {
      setScoring(null);
    }
  };

  // ---- Derived chart data ----
  const stats = statQuery.data;
  const rawEvents = turnsQuery.data?.rawEvents ?? [];
  const schemaConfigured = turnsQuery.data?.schemaConfigured ?? true;
  const isEmpty =
    !!params && !statQuery.isLoading && (stats?.empty || (stats?.totalSessions ?? 0) === 0);

  const drillTurns = useMemo(() => {
    let list = enrichedTurns;
    if (selectedType) list = list.filter((t) => t.questionType === selectedType);
    if (reviewOnly)
      list = list.filter(
        (t) =>
          t.status === "no_answer" ||
          (t.relevanceScore != null && t.relevanceScore <= 2) ||
          (t.relevanceFlags ?? []).some(
            (f) => f === "possible_hallucination" || f === "no_answer",
          ),
      );
    return list;
  }, [enrichedTurns, selectedType, reviewOnly]);

  const error = (statQuery.error || turnsQuery.error) as Error | undefined;

  return (
    <div className="app">
      <div className="header">
        <h1>StarPal — Analytics conversations</h1>
        <span className="spacer" />
        {config.data?.email && <span className="muted">{config.data.email}</span>}
        {role === "STAFF" && (
          <button className="secondary" onClick={() => setShowAdmin((s) => !s)}>
            {showAdmin ? "← Tableau de bord" : "Administration"}
          </button>
        )}
        <button className="secondary" onClick={() => logout()}>
          Déconnexion
        </button>
      </div>

      {showAdmin && role === "STAFF" ? (
        <Admin />
      ) : (
        <>
      <TopBar pals={pals} showClient={role === "STAFF"} loading={false} onLoad={onLoad} />

      {config.error && (
        <Banner kind="error">Backend injoignable : {(config.error as Error).message}</Banner>
      )}
      {error && <Banner kind="error">{error.message}</Banner>}
      {actionError && <Banner kind="error">{actionError}</Banner>}

      {params && !schemaConfigured && (
        <Banner kind="error">
          Aucun événement Q/R reconnu — vérifiez <code>server/src/config.ts</code> (eventSchema).
          Lancez le script de découverte puis renseignez les noms d'événements.
        </Banner>
      )}

      {!params && <div className="center">Choisissez un Pal et cliquez « Charger ».</div>}
      {(statQuery.isLoading || turnsQuery.isLoading) && <div className="center">Chargement…</div>}
      {isEmpty && (
        <Banner kind="info">Aucune donnée pour ce Pal sur la période sélectionnée.</Banner>
      )}

      {params && stats && !isEmpty && (
        <>
          <KpiCards stats={stats} totalEvents={turnsQuery.data?.totalEvents ?? 0} turns={enrichedTurns} />

          {/* Exports */}
          <div className="card">
            <h2>Exports</h2>
            <div className="toolbar">
              <button className="secondary" onClick={() => download("conversation-log.csv", turnsToCsv(enrichedTurns), "text/csv")}>
                Log CSV
              </button>
              <button className="secondary" onClick={() => download("turns.json", turnsToJson(enrichedTurns), "application/json")}>
                Turns JSON
              </button>
              <button className="secondary" onClick={() => download("transcripts.txt", transcriptText(enrichedTurns))}>
                Transcriptions
              </button>
              <button className="secondary" onClick={() => download("raw-events.csv", rawEventsToCsv(rawEvents), "text/csv")}>
                Événements bruts (debug)
              </button>
              <span className="spacer" />
              <span className="muted">
                {turnsQuery.data?.unpairedQuestionCount ?? 0} sans réponse ·{" "}
                {turnsQuery.data?.orphanAnswers.length ?? 0} réponses orphelines
              </span>
            </div>
          </div>

          {/* Volume charts */}
          <div className="grid2">
            <SessionsPerDayChart data={sessionsPerDay(rawEvents)} />
            <EventNameChart data={eventNameDistribution(turnsQuery.data?.eventNameCounts ?? {})} />
            <DurationBucketsChart data={durationBuckets(stats.sessions)} />
            <QuestionTypeChart
              data={questionTypeDistribution(enrichedTurns, taxonomy)}
              onSelect={setSelectedType}
              selected={selectedType}
            />
          </div>

          {/* Classification controls */}
          <div className="card">
            <h2>Classification des questions</h2>
            <div className="toolbar">
              <button onClick={runClassify} disabled={!anthropicEnabled || !!classifying || baseTurns.length === 0}>
                Classer les questions
              </button>
              {!anthropicEnabled && <span className="muted">ANTHROPIC_API_KEY non configurée.</span>}
              {classifying && (
                <span className="muted">
                  {classifying.done}/{classifying.total}
                </span>
              )}
            </div>
            {classifying && (
              <div className="progress" style={{ marginTop: 8 }}>
                <div style={{ width: `${(classifying.done / Math.max(1, classifying.total)) * 100}%` }} />
              </div>
            )}
          </div>

          {/* Relevance controls */}
          <div className="card">
            <h2>Pertinence des réponses (Claude juge)</h2>
            <div className="toolbar">
              <label className="checkbox" style={{ margin: 0 }}>
                N&nbsp;=&nbsp;
                <input
                  type="number"
                  min={1}
                  value={sampleN}
                  onChange={(e) => setSampleN(Math.max(1, Number(e.target.value)))}
                  style={{ width: 70 }}
                />
              </label>
              <button onClick={() => runScore(false)} disabled={!anthropicEnabled || !!scoring}>
                Scorer un échantillon de {sampleN}
              </button>
              <button className="secondary" onClick={() => runScore(true)} disabled={!anthropicEnabled || !!scoring}>
                Tout scorer ({scorablePairs.length})
              </button>
              {!anthropicEnabled && <span className="muted">ANTHROPIC_API_KEY non configurée.</span>}
              {scoring && (
                <span className="muted">
                  {scoring.done}/{scoring.total}
                </span>
              )}
            </div>
            {scoring && (
              <div className="progress" style={{ marginTop: 8 }}>
                <div style={{ width: `${(scoring.done / Math.max(1, scoring.total)) * 100}%` }} />
              </div>
            )}
            <p className="muted" style={{ marginBottom: 0 }}>
              Le scoring n'est jamais lancé automatiquement (coût API). Résultats mis en cache côté serveur.
            </p>
          </div>

          {/* Relevance charts */}
          {relMap.size > 0 && (
            <div className="grid2">
              <RelevanceHistogramChart data={relevanceHistogram(enrichedTurns)} />
              <FlagBarChart data={flagDistribution(enrichedTurns, flags)} />
              <RelevanceTrendChart data={relevancePerDay(enrichedTurns)} />
            </div>
          )}

          {/* Drill / review table */}
          <div className="card">
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Tours Q/R</h2>
              <span className="spacer" />
              {selectedType && (
                <button className="secondary" onClick={() => setSelectedType(null)}>
                  Type : {selectedType} ✕
                </button>
              )}
              <label className="checkbox" style={{ margin: 0 }}>
                <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
                À revoir (faible pertinence / hallucination / sans réponse)
              </label>
              <span className="muted">{drillTurns.length} tours</span>
            </div>
            <div className="transcript">
              {drillTurns.length === 0 && <span className="muted">Aucun tour.</span>}
              {drillTurns.slice(0, 300).map((t, i) => (
                <div className="turn" key={i}>
                  <div className="q">
                    👤 {t.question} <TurnBadges turn={t} />
                  </div>
                  <div className="a">🤖 {t.answer ?? <em>(aucune réponse)</em>}</div>
                  {t.relevanceNote && <div className="muted">↳ {t.relevanceNote}</div>}
                </div>
              ))}
              {drillTurns.length > 300 && (
                <span className="muted">… {drillTurns.length - 300} de plus (affinez le filtre)</span>
              )}
            </div>
          </div>

          <SessionsTable sessions={stats.sessions} turns={enrichedTurns} />
        </>
      )}
        </>
      )}
    </div>
  );
}
