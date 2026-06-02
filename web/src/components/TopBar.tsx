import { useEffect, useState } from "react";
import type { AllowedPal, QueryParams } from "../types";

interface Props {
  // Pals the logged-in user may see (scoped server-side). No free palId input —
  // a CLIENT can only ever pick among their own client's pals.
  pals: AllowedPal[];
  showClient: boolean; // STAFF sees the owning client name
  loading: boolean;
  onLoad: (params: QueryParams) => void;
}

/** Date input (yyyy-mm-dd) -> Unix ms, or undefined when blank. */
function toMs(date: string, endOfDay = false): number | undefined {
  if (!date) return undefined;
  const ms = Date.parse(endOfDay ? `${date}T23:59:59.999Z` : `${date}T00:00:00.000Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

export function TopBar({ pals, showClient, loading, onLoad }: Props) {
  const [palId, setPalId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [excludeEmpty, setExcludeEmpty] = useState(true);

  // Auto-select when there is exactly one pal.
  useEffect(() => {
    if (pals.length === 1) setPalId(pals[0].palId);
  }, [pals]);

  const submit = () => {
    if (!palId) return;
    onLoad({ palId, from: toMs(from), to: toMs(to, true), excludeEmpty });
  };

  return (
    <div className="topbar">
      <div className="field">
        <label>Pal</label>
        <select value={palId} onChange={(e) => setPalId(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">— choisir un Pal —</option>
          {pals.map((p) => (
            <option key={p.palId} value={p.palId}>
              {showClient ? `${p.client} — ${p.label}` : p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Du</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="field">
        <label>Au</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="field">
        <label>&nbsp;</label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={excludeEmpty}
            onChange={(e) => setExcludeEmpty(e.target.checked)}
          />
          Exclure les sessions vides
        </label>
      </div>
      <button onClick={submit} disabled={loading || !palId}>
        {loading ? "Chargement…" : "Charger"}
      </button>
    </div>
  );
}
