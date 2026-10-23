"use client";

import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ApprovalItem = {
  id: string;
  status: string;
  scopeHash: string;
  mission: {
    id: string;
    title: string;
    status: string;
    synthetic: boolean;
  };
};

export default function AdminHome() {
  const [email, setEmail] = useState("approver@a.atlas.local");
  const [password, setPassword] = useState("atlas-demo");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string; staffRoles: string[] } | null>(
    null,
  );
  const [queue, setQueue] = useState<ApprovalItem[]>([]);
  const [routing, setRouting] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const headers = useCallback(
    () =>
      ({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }) as Record<string, string>,
    [token],
  );

  async function login() {
    setError(null);
    const res = await fetch(`${API}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message ?? "Échec connexion");
      return;
    }
    setToken(data.accessToken);
    setUser(data.user);
  }

  const refresh = useCallback(async () => {
    if (!token) return;
    const [q, r] = await Promise.all([
      fetch(`${API}/v1/admin/approvals`, { headers: headers() }).then((x) =>
        x.json(),
      ),
      fetch(`${API}/v1/admin/routing`, { headers: headers() }).then((x) =>
        x.json(),
      ),
    ]);
    setQueue(Array.isArray(q) ? q : []);
    setRouting(Array.isArray(r) ? r : []);
  }, [token, headers]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setMsg(null);
    setError(null);
    const res = await fetch(`${API}/v1/admin/approvals/${id}/decide`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(
        typeof data.message === "string"
          ? data.message
          : JSON.stringify(data.message ?? data),
      );
      return;
    }
    setMsg(`Décision ${decision} enregistrée (rôle approver uniquement).`);
    await refresh();
  }

  async function importStub() {
    if (!user) return;
    const me = await fetch(`${API}/v1/auth/me`, { headers: headers() }).then(
      (r) => r.json(),
    );
    const res = await fetch(`${API}/v1/admin/routing/import-stub`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ orgId: me.orgId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(JSON.stringify(data));
      return;
    }
    setMsg(
      "Import stub hiérarchie enregistré — clairement marqué isStub (pas la hiérarchie réelle A).",
    );
    await refresh();
  }

  return (
    <>
      <h1>File d&apos;approbation</h1>
      <p className="muted">
        L&apos;approbation A ne remplace jamais l&apos;autorisation propriétaire.
        Support / facturation ne peuvent pas approuver.
      </p>
      <div className="banner">
        Auth locale seedée (pas d&apos;OIDC réel). Données FICTIVES. Hiérarchie A
        réelle non inventée — configurez le routage ou les missions réelles restent
        BLOCKED.
      </div>

      {!token ? (
        <div className="panel">
          <h2>Connexion staff</h2>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" onClick={() => void login()}>
            Se connecter
          </button>
          <p className="muted">
            Ex. approver@a.atlas.local / atlas-demo — ou support@… pour vérifier le
            refus RBAC.
          </p>
        </div>
      ) : (
        <>
          <div className="panel">
            <p>
              Connecté : <code>{user?.email}</code> · rôles{" "}
              <code>{user?.staffRoles?.join(", ")}</code>
            </p>
            <button type="button" className="secondary" onClick={() => void refresh()}>
              Rafraîchir
            </button>
            {user?.staffRoles?.includes("admin") && (
              <button type="button" className="secondary" onClick={() => void importStub()}>
                Import stub routage
              </button>
            )}
          </div>

          <div className="panel">
            <h2>Demandes</h2>
            {queue.length === 0 && (
              <p className="muted">Aucune demande en file pour le moment.</p>
            )}
            <ul>
              {queue.map((item) => (
                <li key={item.id} className="item">
                  <div>
                    <strong>{item.mission.title}</strong>{" "}
                    {item.mission.synthetic && (
                      <span className="muted">[FICTIF]</span>
                    )}
                  </div>
                  <div className="muted">
                    statut req. {item.status} · mission {item.mission.status}
                  </div>
                  <div>
                    scope <code>{item.scopeHash.slice(0, 16)}…</code>
                  </div>
                  {item.status === "pending" &&
                    user?.staffRoles?.includes("approver") && (
                      <>
                        <button
                          type="button"
                          onClick={() => void decide(item.id, "approved")}
                        >
                          Approuver
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void decide(item.id, "rejected")}
                        >
                          Rejeter
                        </button>
                      </>
                    )}
                  {item.status === "blocked_no_route" && (
                    <p className="error">
                      NO_APPROVAL_ROUTE — configurez le routage (stub OK en démo).
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>Routage approbateur</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
              {JSON.stringify(routing, null, 2)}
            </pre>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
      {msg && <p>{msg}</p>}
    </>
  );
}
