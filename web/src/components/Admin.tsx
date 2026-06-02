import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type AdminClient } from "../api";

/** STAFF-only provisioning: clients, their pals, and user accounts. */
export function Admin() {
  const qc = useQueryClient();
  const clientsQuery = useQuery({ queryKey: ["admin-clients"], queryFn: api.adminClients });
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-clients"] });
  const wrap = (fn: () => Promise<unknown>) => async () => {
    setErr(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Erreur");
    }
  };

  const [clientName, setClientName] = useState("");
  const clients = clientsQuery.data?.clients ?? [];

  return (
    <div className="card">
      <h2>Administration (staff StarPal)</h2>
      {err && <div className="banner error">{err}</div>}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          placeholder="Nouveau client (ex. Willemse)"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
        <button
          onClick={wrap(async () => {
            if (!clientName.trim()) return;
            await api.adminCreateClient(clientName.trim());
            setClientName("");
          })}
        >
          Créer le client
        </button>
      </div>

      {clients.map((c) => (
        <ClientCard key={c.id} client={c} onChange={wrap} />
      ))}
      {clients.length === 0 && <p className="muted">Aucun client. Créez-en un ci-dessus.</p>}
    </div>
  );
}

function ClientCard({
  client,
  onChange,
}: {
  client: AdminClient;
  onChange: (fn: () => Promise<unknown>) => () => void;
}) {
  const [palId, setPalId] = useState("");
  const [palLabel, setPalLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="transcript" style={{ marginBottom: 12 }}>
      <h3>{client.name}</h3>

      <div className="muted" style={{ marginBottom: 6 }}>Pals</div>
      <ul>
        {client.pals.map((p) => (
          <li key={p.id}>
            <code>{p.palId}</code> — {p.label}
          </li>
        ))}
        {client.pals.length === 0 && <li className="muted">aucun</li>}
      </ul>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <input placeholder="palId" value={palId} onChange={(e) => setPalId(e.target.value)} />
        <input placeholder="libellé" value={palLabel} onChange={(e) => setPalLabel(e.target.value)} />
        <button
          className="secondary"
          onClick={onChange(async () => {
            if (!palId.trim() || !palLabel.trim()) return;
            await api.adminCreatePal(client.id, palId.trim(), palLabel.trim());
            setPalId("");
            setPalLabel("");
          })}
        >
          Ajouter le Pal
        </button>
      </div>

      <div className="muted" style={{ marginBottom: 6 }}>Utilisateurs</div>
      <ul>
        {client.users.map((u) => (
          <li key={u.id}>
            {u.email} <span className="badge flag">{u.role}</span>
          </li>
        ))}
        {client.users.length === 0 && <li className="muted">aucun</li>}
      </ul>
      <div className="toolbar">
        <input
          placeholder="email du client"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="mot de passe (≥ 8)"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="secondary"
          onClick={onChange(async () => {
            if (!email.trim() || password.length < 8) return;
            await api.adminCreateUser(email.trim(), password, "CLIENT", client.id);
            setEmail("");
            setPassword("");
          })}
        >
          Créer l'utilisateur
        </button>
      </div>
    </div>
  );
}
