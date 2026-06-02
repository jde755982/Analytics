// Shared types mirroring the backend responses.

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
  empty?: boolean;
}

export interface RawEvent {
  sessionId: string;
  eventName: string;
  eventData: unknown;
  created: number;
}

export interface Turn {
  sessionId: string;
  question: string;
  answer: string | null;
  askedAt: number;
  answeredAt: number | null;
  status: "paired" | "no_answer";
}

export interface OrphanAnswer {
  sessionId: string;
  answer: string;
  answeredAt: number;
}

export interface TurnsResponse {
  turns: Turn[];
  orphanAnswers: OrphanAnswer[];
  unpairedQuestionCount: number;
  eventNameCounts: Record<string, number>;
  totalEvents: number;
  schemaConfigured: boolean;
  rawEvents: RawEvent[];
  empty?: boolean;
}

export interface Classification {
  type: string;
  confidence: number;
}

export type RelevanceFlag =
  | "answered_fully"
  | "partial"
  | "deflected"
  | "off_topic"
  | "possible_hallucination"
  | "needs_human"
  | "no_answer";

export interface Relevance {
  score: number; // 1..5, 0 = unscored
  flags: RelevanceFlag[];
  note?: string;
}

/** A Pal the logged-in user is allowed to see (scoped server-side). */
export interface AllowedPal {
  palId: string;
  label: string;
  client: string;
}

export interface ConfigResponse {
  taxonomy: string[];
  relevanceFlags: RelevanceFlag[];
  pals: AllowedPal[];
  models: { classifier: string; judge: string };
  role: "STAFF" | "CLIENT";
  email: string;
  schemaConfigured: boolean;
  anthropicEnabled: boolean;
}

export interface QueryParams {
  palId: string;
  from?: number;
  to?: number;
  excludeEmpty: boolean;
}

/** A Turn enriched with classification + relevance (filled progressively). */
export interface EnrichedTurn extends Turn {
  questionType?: string;
  relevanceScore?: number;
  relevanceFlags?: RelevanceFlag[];
  relevanceNote?: string;
}
