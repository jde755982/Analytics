import { Fragment, useMemo, useState } from "react";
import { localDateTime, msToClock } from "../lib/format";
import type { EnrichedTurn, StatSession } from "../types";
import { TurnBadges } from "./TurnBadges";

type SortKey = "id" | "firstEventCreated" | "lastEventCreated" | "numEvents" | "duration";

interface Props {
  sessions: StatSession[];
  turns: EnrichedTurn[];
}

export function SessionsTable({ sessions, turns }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("firstEventCreated");
  const [asc, setAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const turnsBySession = useMemo(() => {
    const m = new Map<string, EnrichedTurn[]>();
    for (const t of turns) {
      const arr = m.get(t.sessionId) ?? [];
      arr.push(t);
      m.set(t.sessionId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.askedAt - b.askedAt);
    return m;
  }, [turns]);

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [sessions, sortKey, asc]);

  const setSort = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(false);
    }
  };

  const arrow = (key: SortKey) => (key === sortKey ? (asc ? " ▲" : " ▼") : "");

  return (
    <div className="card">
      <h2>Sessions</h2>
      <table>
        <thead>
          <tr>
            <th onClick={() => setSort("id")}>Session{arrow("id")}</th>
            <th onClick={() => setSort("firstEventCreated")}>Début{arrow("firstEventCreated")}</th>
            <th onClick={() => setSort("lastEventCreated")}>Fin{arrow("lastEventCreated")}</th>
            <th onClick={() => setSort("numEvents")}>Événements{arrow("numEvents")}</th>
            <th onClick={() => setSort("duration")}>Durée{arrow("duration")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const isOpen = expanded === s.id;
            const sessionTurns = turnsBySession.get(s.id) ?? [];
            return (
              <Fragment key={s.id}>
                <tr
                  className="clickable"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                >
                  <td>{isOpen ? "▾ " : "▸ "}{s.id}</td>
                  <td>{localDateTime(s.firstEventCreated)}</td>
                  <td>{localDateTime(s.lastEventCreated)}</td>
                  <td>{s.numEvents}</td>
                  <td>{msToClock(s.duration)}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5}>
                      <div className="transcript">
                        {sessionTurns.length === 0 && (
                          <span className="muted">Aucun tour Q/R reconnu pour cette session.</span>
                        )}
                        {sessionTurns.map((t, i) => (
                          <div className="turn" key={i}>
                            <div className="q">
                              👤 {t.question} <TurnBadges turn={t} />
                            </div>
                            <div className="a">
                              🤖 {t.answer ?? <em>(aucune réponse)</em>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
