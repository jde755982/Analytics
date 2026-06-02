/**
 * Requirement 2 — server-side question-type classification.
 *
 * Input: an array of question strings. Output: order-aligned classifications.
 * Each result is cached by SHA-256 of the question text, so re-runs are free.
 * Unknown / failed items are marked "unclassified" rather than crashing the
 * batch.
 */
import { batching, models, questionTaxonomy } from "./config.js";
import { getAnthropic, parseJsonArray, textOf } from "./lib/anthropic.js";
import { JsonCache, sha256 } from "./lib/cache.js";

export interface Classification {
  type: string; // a taxonomy label, or "unclassified"
  confidence: number; // 0..1
}

const UNCLASSIFIED: Classification = { type: "unclassified", confidence: 0 };

const cache = new JsonCache<Classification>("classify");

const SYSTEM_PROMPT = [
  "Tu es un classateur de messages clients pour un site e-commerce français de jardinage / plantes (Willemse).",
  "Les messages sont rédigés EN FRANÇAIS.",
  "Classe chaque question dans EXACTEMENT une catégorie parmi la taxonomie suivante :",
  questionTaxonomy.map((t) => `- ${t}`).join("\n"),
  "",
  "Réponds UNIQUEMENT avec un tableau JSON valide, sans prose ni balises de code.",
  'Format : [{"index": <number>, "type": "<libellé exact de la taxonomie>", "confidence": <0..1>}]',
  "Le tableau doit contenir un objet par question, dans le MÊME ordre que l'entrée, avec le même index.",
  'Si une question ne correspond à rien, utilise "Autre / hors-sujet".',
].join("\n");

function buildUserPrompt(batch: string[]): string {
  const lines = batch.map((q, i) => `${i}. ${q.replace(/\s+/g, " ").trim()}`);
  return `Questions à classer :\n${lines.join("\n")}`;
}

async function classifyBatch(batch: string[]): Promise<Classification[]> {
  const anthropic = getAnthropic();
  const message = await anthropic.messages.create({
    model: models.classifier,
    max_tokens: 1024,
    system: [
      // Static taxonomy prompt is cached to cut token cost across batches.
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildUserPrompt(batch) }],
  });

  const parsed = parseJsonArray<{ index: number; type: string; confidence: number }>(
    textOf(message),
  );

  // Validate batch length / shape; fall back to unclassified on any mismatch.
  if (!parsed) return batch.map(() => ({ ...UNCLASSIFIED }));

  const byIndex = new Map<number, { type: string; confidence: number }>();
  for (const item of parsed) {
    if (item && typeof item.index === "number") byIndex.set(item.index, item);
  }

  return batch.map((_, i) => {
    const item = byIndex.get(i);
    if (!item || typeof item.type !== "string") return { ...UNCLASSIFIED };
    // Normalize to a known label; unknown labels collapse to "Autre / hors-sujet".
    const type = questionTaxonomy.includes(item.type) ? item.type : "Autre / hors-sujet";
    const confidence =
      typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5;
    return { type, confidence };
  });
}

/**
 * Classify an arbitrary list of questions. Returns results aligned to input
 * order. Cached items cost nothing; uncached unique texts are batched.
 */
export async function classifyQuestions(questions: string[]): Promise<Classification[]> {
  const results = new Array<Classification | undefined>(questions.length);

  // Resolve cache hits; collect unique uncached texts.
  const toFetch = new Map<string, number[]>(); // text -> input indices
  questions.forEach((q, i) => {
    const key = sha256(q);
    const hit = cache.get(key);
    if (hit) {
      results[i] = hit;
    } else {
      const arr = toFetch.get(q);
      if (arr) arr.push(i);
      else toFetch.set(q, [i]);
    }
  });

  const uniqueTexts = [...toFetch.keys()];
  for (let i = 0; i < uniqueTexts.length; i += batching.classifyBatchSize) {
    const batch = uniqueTexts.slice(i, i + batching.classifyBatchSize);
    let classified: Classification[];
    try {
      classified = await classifyBatch(batch);
    } catch {
      classified = batch.map(() => ({ ...UNCLASSIFIED }));
    }
    batch.forEach((text, j) => {
      const c = classified[j] ?? { ...UNCLASSIFIED };
      if (c.type !== "unclassified") cache.set(sha256(text), c);
      for (const idx of toFetch.get(text) ?? []) results[idx] = c;
    });
  }
  cache.flush();

  return results.map((r) => r ?? { ...UNCLASSIFIED });
}
