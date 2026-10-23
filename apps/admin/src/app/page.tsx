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
    tenant?: { slug: string; name: string };
  };
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  syntheticDemo: boolean;
};

type RoutingRow = {
  id: string;
  isStub: boolean;
  orgWide: boolean;
  enabled: boolean;
  tenantId?: string | null;
  tenant?: { slug: string } | null;
  staffGroup?: { name: string; memberIds: string[]; isStub: boolean } | null;
};

export default function AdminHome() {
  const [email, setEmail] = useState("approver@a.atlas.local");
  const [password, setPassword] = useState("atlas-demo");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{
    email: string;
    staffRoles: string[];
    orgId?: string;
  } | null>(null);
  const [queue, setQueue] = useState<ApprovalItem[]>([]);
  const [routing, setRouting] = useState<RoutingRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [audit, setAudit] = useState<{ ok?: boolean; checked?: number; reason?: string } | null>(
    null,
  );
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
    const [q, r, t] = await Promise.all([
      fetch(`${API}/v1/admin/approvals`, { headers: headers() }).then((x) =>
        x.json(),
      ),
      fetch(`${API}/v1/admin/routing`, { headers: headers() }).then((x) =>
        x.json(),
      ),
      fetch(`${API}/v1/admin/tenants`, { headers: headers() }).then((x) =>
        x.json(),
      ),
    ]);
    setQueue(Array.isArray(q) ? q : []);
    setRouting(Array.isArray(r) ? r : []);
    if (Array.isArray(t)) {
      setTenants(t);
      if (!tenantId && t[0]) setTenantId(t[0].id);
    }
  }, [token, headers, tenantId]);

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
    setMsg(
      `Décision « ${decision} » enregistrée (rôle approver uniquement — support/billing exclus).`,
    );
    await refresh();
  }

  async function importStub() {
    setError(null);
    setMsg(null);
    const me = await fetch(`${API}/v1/auth/me`, { headers: headers() }).then(
      (r) => r.json(),
    );
    const res = await fetch(`${API}/v1/admin/routing/import-stub`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        orgId: me.orgId,
        tenantId: tenantId || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(JSON.stringify(data));
      return;
    }
    setMsg(
      `${data.disclaimer ?? "Stub importé."} Missions débloquées : ${(data.unblockedMissions ?? []).length}.`,
    );
    await refresh();
  }

  async function verifyAudit() {
    setError(null);
    const res = await fetch(`${API}/v1/admin/audit/verify`, {
      headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(JSON.stringify(data));
      return;
    }
    setAudit(data);
  }

  const canApprove = user?.staffRoles?.includes("approver");
  const isAdmin = user?.staffRoles?.includes("admin");
  const blockedCount = queue.filter((q) => q.status === "blocked_no_route").length;

  return (
    <>
      <h1>File d&apos;approbation</h1>
      <p className="muted">
        Circuit entreprise A · l&apos;approbation A ne remplace jamais
        l&apos;autorisation propriétaire · abonnement ≠ droit d&apos;exécuter.
      </p>
      <div className="banner">
        Auth locale seedée (pas d&apos;OIDC). Données FICTIVES. Hiérarchie A réelle
        non inventée — utilisez l&apos;import stub pour débloquer le routage en
        démo uniquement.
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
            approver@a.atlas.local / atlas-demo — ou support@… (refus RBAC à
            l&apos;approbation) · admin@… pour l&apos;import stub.
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
              Rafraîchir la file
            </button>
            {(isAdmin || user?.staffRoles?.includes("ops")) && (
              <button type="button" className="secondary" onClick={() => void verifyAudit()}>
                Vérifier chaîne audit
              </button>
            )}
            {audit && (
              <p className={audit.ok ? "" : "error"}>
                Audit verify_chain : {audit.ok ? "OK" : "INVALIDE"} (
                {audit.checked ?? 0} événements)
                {audit.reason ? ` — ${audit.reason}` : ""}
              </p>
            )}
          </div>

          {isAdmin && (
            <div className="panel">
              <h2>Débloquer le routage (stub démo)</h2>
              <p className="muted">
                Import d&apos;un groupe d&apos;approbateurs <strong>fictif</strong>{" "}
                (`isStub`) — pas l&apos;organigramme réel A. Débloque les missions
                `NO_APPROVAL_ROUTE` / file `blocked_no_route`.
              </p>
              {blockedCount > 0 && (
                <p className="error">
                  {blockedCount} demande(s) bloquée(s) faute de route.
                </p>
              )}
              <label>Tenant cible (ou laisser pour le premier de la liste)</label>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  background: "#10161d",
                  color: "#e8eef4",
                  border: "1px solid #2a3542",
                }}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.slug} — {t.name}
                    {t.syntheticDemo ? " [démo]" : ""}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void importStub()}>
                Importer stub hiérarchie pour ce tenant
              </button>
            </div>
          )}

          <div className="panel">
            <h2>Demandes en file</h2>
            {!canApprove && (
              <p className="muted">
                Lecture seule pour votre rôle — seul <code>approver</code> peut
                décider.
              </p>
            )}
            {queue.length === 0 && (
              <p className="muted">
                Aucune demande. Les missions réelles sans route restent BLOCKED
                jusqu&apos;à l&apos;import stub (admin).
              </p>
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
                    tenant {item.mission.tenant?.slug ?? "—"} · req.{" "}
                    {item.status} · mission {item.mission.status}
                  </div>
                  <div>
                    scope <code>{item.scopeHash.slice(0, 16)}…</code>
                  </div>
                  {item.status === "pending" && canApprove && (
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
                      NO_APPROVAL_ROUTE — admin : section « Débloquer le routage »
                      ci-dessus.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>Politiques de routage</h2>
            {routing.length === 0 ? (
              <p className="muted">Aucune politique — import stub recommandé en démo.</p>
            ) : (
              <ul>
                {routing.map((p) => (
                  <li key={p.id} className="item">
                    <div>
                      {p.staffGroup?.name ?? p.id}{" "}
                      {p.isStub && <span className="muted">[STUB]</span>}
                    </div>
                    <div className="muted">
                      {p.orgWide
                        ? "org-wide"
                        : `tenant ${p.tenant?.slug ?? p.tenantId}`}{" "}
                      · {p.enabled ? "enabled" : "disabled"} · membres{" "}
                      {p.staffGroup?.memberIds?.length ?? 0}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
      {msg && <p>{msg}</p>}
    </>
  );
}
