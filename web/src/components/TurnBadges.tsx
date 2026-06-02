import type { EnrichedTurn } from "../types";

/** Inline badges for a turn's question type + relevance score + flags. */
export function TurnBadges({ turn }: { turn: EnrichedTurn }) {
  return (
    <>
      {turn.questionType && <span className="badge type">{turn.questionType}</span>}{" "}
      {turn.relevanceScore ? (
        <span className={`badge score-${turn.relevanceScore}`}>note {turn.relevanceScore}/5</span>
      ) : null}{" "}
      {(turn.relevanceFlags ?? []).map((f) => (
        <span className="badge flag" key={f}>
          {f}
        </span>
      ))}
    </>
  );
}
