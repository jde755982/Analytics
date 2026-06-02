/**
 * Requirement 3 — server-side answer-relevance scoring (Claude as judge).
 *
 * Input: an array of {question, answer} pairs. Output: order-aligned scores.
 * Each result is cached by SHA-256 of (question + "\n" + answer). Because this
 * costs money, the FRONTEND decides how many pairs to send ("Score sample of N
 * / Score all") — this module never auto-scores a whole range on its own.
 */
import { batching, models, relevanceFlags, type RelevanceFlag } from "./config.js";
import { getAnthropic, parseJsonArray, textOf } from "./lib/anthropic.js";
import { JsonCache, sha256 } from "./lib/cache.js";

export interface Relevance {
  score: number; // 1..5, or 0 when unscored/failed
  flags: RelevanceFlag[];
  note?: string;
}

export interface Pair {
  question: string;
  answer: string;
}

const UNSCORED: Relevance = { score: 0, flags: [] };

const cache = new JsonCache<Relevance>("relevance");

const flagSet = new Set<string>(relevanceFlags);

const SYSTEM_PROMPT = [
  "Tu es un évaluateur qualité pour un agent conversationnel d'un site e-commerce français de jardinage (Willemse).",
  "Les échanges sont EN FRANÇAIS. Pour chaque paire (question utilisateur, réponse de l'agent),",
  "évalue dans quelle mesure la réponse répond correctement à la question.",
  "",
  "score : entier de 1 à 5",
  "  1 = hors-sujet ; 3 = partiel ; 5 = répond pleinement et correctement.",
  `flags : tableau de zéro ou plusieurs valeurs PARMI : ${relevanceFlags.join(", ")}.`,
  "note : courte justification facultative (français, max ~15 mots).",
  "",
  "Réponds UNIQUEMENT avec un tableau JSON valide, sans prose ni balises de code.",
  'Format : [{"index": <number>, "score": <1-5>, "flags": ["..."], "note": "..."}]',
  "Un objet par paire, dans le MÊME ordre que l'entrée, avec le même index.",
].join("\n");

function buildUserPrompt(batch: Pair[]): string {
  const blocks = batch.map(
    (p, i) =>
      `### Paire ${i}\nQuestion: ${p.question.replace(/\s+/g, " ").trim()}\nRéponse: ${p.answer
        .replace(/\s+/g, " ")
        .trim()}`,
  );
  return `Évalue les paires suivantes :\n\n${blocks.join("\n\n")}`;
}

function normalizeFlags(flags: unknown): RelevanceFlag[] {
  if (!Array.isArray(flags)) return [];
  return flags.filter((f): f is RelevanceFlag => typeof f === "string" && flagSet.has(f));
}

async function scoreBatch(batch: Pair[]): Promise<Relevance[]> {
  const anthropic = getAnthropic();
  const message = await anthropic.messages.create({
    model: models.judge,
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserPrompt(batch) }],
  });

  const parsed = parseJsonArray<{
    index: number;
    score: number;
    flags: unknown;
    note?: string;
  }>(textOf(message));

  if (!parsed) return batch.map(() => ({ ...UNSCORED }));

  const byIndex = new Map<number, (typeof parsed)[number]>();
  for (const item of parsed) {
    if (item && typeof item.index === "number") byIndex.set(item.index, item);
  }

  return batch.map((_, i) => {
    const item = byIndex.get(i);
    if (!item || typeof item.score !== "number") return { ...UNSCORED };
    const score = Math.max(1, Math.min(5, Math.round(item.score)));
    const result: Relevance = { score, flags: normalizeFlags(item.flags) };
    if (typeof item.note === "string" && item.note.trim()) result.note = item.note.trim();
    return result;
  });
}

/**
 * Score the given pairs. Returns results aligned to input order. Caller is
 * responsible for limiting how many pairs it sends (sample N vs. all).
 */
export async function scorePairs(pairs: Pair[]): Promise<Relevance[]> {
  const results = new Array<Relevance | undefined>(pairs.length);

  const keyOf = (p: Pair) => sha256(`${p.question}\n${p.answer}`);
  const toFetch: { pair: Pair; idx: number }[] = [];

  pairs.forEach((p, i) => {
    const hit = cache.get(keyOf(p));
    if (hit) results[i] = hit;
    else toFetch.push({ pair: p, idx: i });
  });

  for (let i = 0; i < toFetch.length; i += batching.judgeBatchSize) {
    const slice = toFetch.slice(i, i + batching.judgeBatchSize);
    let scored: Relevance[];
    try {
      scored = await scoreBatch(slice.map((s) => s.pair));
    } catch {
      scored = slice.map(() => ({ ...UNSCORED }));
    }
    slice.forEach((s, j) => {
      const r = scored[j] ?? { ...UNSCORED };
      if (r.score > 0) cache.set(keyOf(s.pair), r);
      results[s.idx] = r;
    });
  }
  cache.flush();

  return results.map((r) => r ?? { ...UNSCORED });
}
