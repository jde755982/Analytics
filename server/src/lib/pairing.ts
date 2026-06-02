/**
 * Q&A pairing.
 *
 * Within a sessionId: sort events by `created`, then walk them in order. When
 * we see a user-question event, the NEXT agent-answer event (before the
 * following question) is its answer. Questions with no following answer are
 * kept and flagged "no_answer"; agent answers with no preceding open question
 * are kept as orphans. Nothing is dropped.
 *
 * Which eventNames count as questions vs. answers — and where the text lives —
 * comes entirely from eventSchema in config.ts (see ./lib/path.ts for textPath
 * resolution). This module contains NO event-name literals.
 */
import { eventSchema, isEventSchemaConfigured } from "../config.js";
import { getText } from "./path.js";
import type { RawEvent } from "./upstream.js";

export interface Turn {
  sessionId: string;
  question: string;
  answer: string | null;
  askedAt: number; // Unix ms
  answeredAt: number | null; // Unix ms
  /** "paired" = question got an answer; "no_answer" = unpaired question. */
  status: "paired" | "no_answer";
}

export interface OrphanAnswer {
  sessionId: string;
  answer: string;
  answeredAt: number;
}

export interface PairingResult {
  turns: Turn[];
  orphanAnswers: OrphanAnswer[];
  /** Count of turns flagged no_answer (subset of turns). */
  unpairedQuestionCount: number;
  /** Distinct eventName -> count, for the event-name distribution chart. */
  eventNameCounts: Record<string, number>;
  totalEvents: number;
  /** False when eventSchema still has TODO placeholders. */
  schemaConfigured: boolean;
}

type Role = "question" | "answer" | "other";

function roleOf(eventName: string): Role {
  if (eventSchema.userQuestion.names.includes(eventName)) return "question";
  if (eventSchema.agentAnswer.names.includes(eventName)) return "answer";
  return "other";
}

export function pairEvents(events: RawEvent[]): PairingResult {
  const eventNameCounts: Record<string, number> = {};
  for (const ev of events) {
    eventNameCounts[ev.eventName] = (eventNameCounts[ev.eventName] ?? 0) + 1;
  }

  const turns: Turn[] = [];
  const orphanAnswers: OrphanAnswer[] = [];

  // Group by session.
  const bySession = new Map<string, RawEvent[]>();
  for (const ev of events) {
    const arr = bySession.get(ev.sessionId);
    if (arr) arr.push(ev);
    else bySession.set(ev.sessionId, [ev]);
  }

  for (const [sessionId, sessionEvents] of bySession) {
    const sorted = [...sessionEvents].sort((a, b) => a.created - b.created);

    // Pending question awaiting its answer.
    let pending: { text: string; askedAt: number } | null = null;

    const flushPending = () => {
      if (pending) {
        turns.push({
          sessionId,
          question: pending.text,
          answer: null,
          askedAt: pending.askedAt,
          answeredAt: null,
          status: "no_answer",
        });
        pending = null;
      }
    };

    for (const ev of sorted) {
      const role = roleOf(ev.eventName);
      if (role === "question") {
        const text = getText(ev, eventSchema.userQuestion.textPath);
        if (!text) continue; // event matched but carried no usable text
        // A new question closes any previous unanswered one.
        flushPending();
        pending = { text, askedAt: ev.created };
      } else if (role === "answer") {
        const text = getText(ev, eventSchema.agentAnswer.textPath);
        if (!text) continue;
        if (pending) {
          turns.push({
            sessionId,
            question: pending.text,
            answer: text,
            askedAt: pending.askedAt,
            answeredAt: ev.created,
            status: "paired",
          });
          pending = null;
        } else {
          orphanAnswers.push({ sessionId, answer: text, answeredAt: ev.created });
        }
      }
      // role === "other" is ignored for pairing (still counted above).
    }
    flushPending();
  }

  // Stable chronological order across sessions for predictable exports.
  turns.sort((a, b) => a.askedAt - b.askedAt);
  orphanAnswers.sort((a, b) => a.answeredAt - b.answeredAt);

  return {
    turns,
    orphanAnswers,
    unpairedQuestionCount: turns.filter((t) => t.status === "no_answer").length,
    eventNameCounts,
    totalEvents: events.length,
    schemaConfigured: isEventSchemaConfigured(),
  };
}
