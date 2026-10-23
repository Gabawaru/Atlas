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

type EntitlementMatrix = {
  principle: string;
  rows: {
    slug: string;
    name: string;
    subscriptionActive: boolean;
    subscription: { status: string; plan: string } | null;
    missions: {
      title: string;
      status: string;
      ownerAuthValid: boolean;
      dualSignature: boolean;
      tokenPresent: boolean;
      canExecuteHint: boolean;
      scopeVersion: number | null;
      exclusions: string[];
    }[];
  }[];
};

type SupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  category: string;
  synthetic: boolean;
  tenant?: { slug: string; name: string };
  mission?: { id: string; title: string; status: string } | null;
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
  const [entitlements, setEntitlements] = useState<EntitlementMatrix | null>(
    null,
  );
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketSubject, setTicketSubject] = useState(
    "[FICTIF] Incident démo — accès rapport",
  );
  const [ticketBody, setTicketBody] = useState(
    "Données fictives : clarification client sur un finding. SAV ≠ approbation.",
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
    const [q, r, t, e, tk] = await Promise.all([
      fetch(`${API}/v1/admin/approvals`, { headers: headers() }).then((x) =>
        x.json(),
      ),
      fetch(`${API}/v1/admin/routing`, { headers: headers() }).then((x) =>
        x.json(),
      ),
      fetch(`${API}/v1/admin/tenants`, { headers: headers() }).then((x) =>
        x.json(),
      ),
      fetch(`${API}/v1/admin/entitlements`, { headers: headers() }).then((x) =>
        x.json(),
      ),
      fetch(`${API}/v1/admin/tickets`, { headers: headers() }).then((x) =>
        x.json(),
      ),
    ]);
    setQueue(Array.isArray(q) ? q : []);
    setRouting(Array.isArray(r) ? r : []);
    if (Array.isArray(t)) {
      setTenants(t);
      if (!tenantId && t[0]) setTenantId(t[0].id);
    }
    if (e?.principle) setEntitlements(e);
    setTickets(Array.isArray(tk) ? tk : []);
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

  async function createTicket() {
    setError(null);
    setMsg(null);
    if (!tenantId) {
      setError("Choisir un tenant pour le ticket SAV.");
      return;
    }
    const res = await fetch(`${API}/v1/admin/tickets`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        tenantId,
        subject: ticketSubject,
        body: ticketBody,
        category: "incident",
        synthetic: true,
      }),
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
    setMsg(data.notice ?? "Ticket SAV créé (≠ approbation).");
    await refresh();
  }

  async function setTicketStatus(
    id: string,
    status: "open" | "waiting" | "resolved" | "closed",
  ) {
    setError(null);
    const res = await fetch(`${API}/v1/admin/tickets/${id}/status`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ status }),
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
    setMsg(`Ticket ${id.slice(0, 8)}… → ${status}`);
    await refresh();
  }

  const canApprove = user?.staffRoles?.includes("approver");
  const canSav = user?.staffRoles?.some((r) =>
    ["support", "ops", "admin"].includes(r),
  );
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

          {entitlements && (
            <div className="panel">
              <h2>Abonnement ≠ autorisation de test</h2>
              <p className="muted">{entitlements.principle}</p>
              <div className="banner">
                Une licence <strong>active</strong> ouvre le produit. Elle ne
                permet <strong>jamais</strong> seule d&apos;exécuter un contrôle :
                il faut RoE versionné, co-signature (2 parties mock), jeton et
                Policy Guard ALLOW.
              </div>
              <ul>
                {entitlements.rows.map((row) => (
                  <li key={row.slug} className="item">
                    <div>
                      <strong>{row.name}</strong>{" "}
                      <span className="muted">({row.slug})</span>
                    </div>
                    <div className="muted">
                      Abonnement :{" "}
                      {row.subscription
                        ? `${row.subscription.plan} / ${row.subscription.status}`
                        : "aucun"}{" "}
                      →{" "}
                      {row.subscriptionActive
                        ? "logiciel OK"
                        : "logiciel inactif"}{" "}
                      · exécution :{" "}
                      {row.subscriptionActive
                        ? "insuffisant seul"
                        : "bloqué"}
                    </div>
                    {row.missions.length === 0 ? (
                      <p className="muted">Aucune mission récente.</p>
                    ) : (
                      <ul>
                        {row.missions.map((m) => (
                          <li key={m.title + m.status}>
                            {m.title} — {m.status}
                            {" · "}
                            auth propriétaire{" "}
                            {m.ownerAuthValid ? "valide" : "absente/invalide"}
                            {" · "}
                            co-signature {m.dualSignature ? "2/2" : "incomplète"}
                            {" · "}
                            jeton {m.tokenPresent ? "oui" : "non"}
                            {m.scopeVersion != null && (
                              <>
                                {" · "}RoE v{m.scopeVersion}
                                {m.exclusions?.length
                                  ? ` (excl. ${m.exclusions.join(", ")})`
                                  : ""}
                              </>
                            )}
                            {" · "}
                            indice exécutable :{" "}
                            {m.canExecuteHint ? "possible" : "non"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel">
            <h2>SAV / tickets / incidents</h2>
            <p className="muted">
              Support client lié au tenant (et optionnellement à une mission).
              Les rôles <code>support</code>/<code>ops</code>/<code>admin</code>{" "}
              gèrent les tickets — <code>approver</code> peut lire, pas muter.
              Un ticket SAV <strong>n&apos;approuve jamais</strong> une mission.
            </p>
            {!canSav && (
              <p className="muted">
                Lecture seule : votre rôle ne peut pas créer ni changer le statut
                SAV.
              </p>
            )}
            {canSav && (
              <>
                <label>Tenant du ticket</label>
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
                    </option>
                  ))}
                </select>
                <label>Sujet</label>
                <input
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                />
                <label>Description</label>
                <textarea
                  rows={3}
                  value={ticketBody}
                  onChange={(e) => setTicketBody(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    background: "#10161d",
                    color: "#e8eef4",
                    border: "1px solid #2a3542",
                  }}
                />
                <button type="button" onClick={() => void createTicket()}>
                  Créer ticket FICTIF
                </button>
              </>
            )}
            {tickets.length === 0 ? (
              <p className="muted">Aucun ticket (seed après migration SAV).</p>
            ) : (
              <ul>
                {tickets.map((tk) => (
                  <li key={tk.id} className="item">
                    <div>
                      <strong>{tk.subject}</strong>{" "}
                      {tk.synthetic && (
                        <span className="muted">[FICTIF]</span>
                      )}
                    </div>
                    <div className="muted">
                      {tk.status} · {tk.category} · tenant{" "}
                      {tk.tenant?.slug ?? "—"}
                      {tk.mission
                        ? ` · mission ${tk.mission.title}`
                        : ""}
                    </div>
                    <p className="muted">{tk.body}</p>
                    {canSav && tk.status !== "closed" && (
                      <>
                        {tk.status === "open" && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              void setTicketStatus(tk.id, "waiting")
                            }
                          >
                            En attente
                          </button>
                        )}
                        {tk.status !== "resolved" && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              void setTicketStatus(tk.id, "resolved")
                            }
                          >
                            Résoudre
                          </button>
                        )}
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void setTicketStatus(tk.id, "closed")}
                        >
                          Clôturer
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

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
