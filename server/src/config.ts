/**
 * ============================================================================
 *  StarPal Conversation Analytics — central configuration
 * ============================================================================
 *
 *  THIS FILE IS THE ONE PLACE WHERE EVENT-SCHEMA ASSUMPTIONS LIVE.
 *  No magic event-name strings should appear anywhere else in the codebase.
 *
 *  The upstream StarPal API returns conversation events as:
 *      { sessionId, eventName, eventData, created }   // created = Unix ms
 *
 *  We do NOT yet know which `eventName` carries the user's question text vs.
 *  the agent's answer text. Run the discovery script to find out:
 *
 *      npm run discover -- --palId <PAL_ID>
 *
 *  Then fill in `eventSchema` below with the real event names and the dotted
 *  path inside `eventData` that holds the text. `textPath` is resolved with the
 *  safe getter in ./lib/path.ts (e.g. "eventData.text", "eventData.message").
 * ============================================================================
 */

export interface EventRole {
  /** One or more eventName values that represent this role. */
  names: string[];
  /** Dotted path (rooted at the event object) to the text payload. */
  textPath: string;
}

export interface EventSchema {
  userQuestion: EventRole;
  agentAnswer: EventRole;
}

/**
 * >>> EDIT ME after running discovery. <<<
 * `names` are placeholders until the discovery script reveals the real values.
 * `textPath` is rooted at the event object, so it begins with "eventData.".
 */
export const eventSchema: EventSchema = {
  userQuestion: { names: ["user_text"], textPath: "eventData.text" },
  agentAnswer: { names: ["bot_text"], textPath: "eventData.text" },
};

/**
 * True once eventSchema has been filled in with real values (i.e. no leftover
 * TODO placeholders). The UI uses this to show the "no recognizable Q&A events
 * — check config.ts" message instead of empty charts.
 */
export function isEventSchemaConfigured(schema: EventSchema = eventSchema): boolean {
  const allNames = [...schema.userQuestion.names, ...schema.agentAnswer.names];
  return allNames.length > 0 && !allNames.some((n) => n.startsWith("TODO_"));
}

/* -------------------------------------------------------------------------- */
/*  Question-type taxonomy (Requirement 2). French labels — editable.         */
/*  The client (Willemse) is a French garden / plants e-commerce retailer.    */
/* -------------------------------------------------------------------------- */

export const questionTaxonomy: string[] = [
  "Disponibilité produit",
  "Conseil jardinage / plantation",
  "Commande & suivi",
  "Livraison & délais",
  "Retours & remboursements",
  "Prix & promotions",
  "Compte & connexion",
  "Réclamation",
  "Autre / hors-sujet",
];

/* -------------------------------------------------------------------------- */
/*  Answer-relevance flags (Requirement 3). Fixed set — editable but the      */
/*  judge prompt and UI both read from here.                                   */
/* -------------------------------------------------------------------------- */

export const relevanceFlags = [
  "answered_fully",
  "partial",
  "deflected",
  "off_topic",
  "possible_hallucination",
  "needs_human",
  "no_answer",
] as const;

export type RelevanceFlag = (typeof relevanceFlags)[number];

/* -------------------------------------------------------------------------- */
/*  Voice-vs-text signal (for the "% interactions vocales" KPI).               */
/*                                                                             */
/*  We don't yet know how the upstream marks a voice interaction. Fill this in */
/*  once discovery shows it (check a user_text event's eventData in the raw    */
/*  export). Examples:                                                         */
/*    { path: "eventData.channel", voiceValues: ["voice", "audio"] }          */
/*    { path: "eventData.inputMode", voiceValues: ["speech"] }                */
/*  When null, the "% interactions vocales" KPI shows "—".                     */
/* -------------------------------------------------------------------------- */

export const voiceSignal: { path: string; voiceValues: string[] } | null = null;

/* -------------------------------------------------------------------------- */
/*  Anthropic models. CONFIRM exact current model IDs against Anthropic docs   */
/*  before relying on these — IDs change. Overridable via env.                 */
/* -------------------------------------------------------------------------- */

export const models = {
  /** Cheap/fast model for question typing. */
  classifier: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5",
  /** Higher-tier model for answer-relevance judging. */
  judge: process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-sonnet-4-6",
};

/* -------------------------------------------------------------------------- */
/*  Optional known-Pals dropdown (no list-pals endpoint upstream).            */
/*  Add { id, label } entries the analyst can pick from in the top bar.       */
/* -------------------------------------------------------------------------- */

export interface KnownPal {
  id: string;
  label: string;
}

export const knownPals: KnownPal[] = [
  // { id: "willemse-pal-id-here", label: "Willemse (FR)" },
];

/* -------------------------------------------------------------------------- */
/*  Upstream + batching knobs.                                                 */
/* -------------------------------------------------------------------------- */

export const upstream = {
  baseUrl:
    process.env.STARPAL_API_BASE ??
    "https://pal-maker-api-dot-symbolic-fire-99808.appspot.com",
};

export const batching = {
  classifyBatchSize: 20, // ~15–25 questions per typing call
  judgeBatchSize: 12, // ~10–15 pairs per relevance call
};
