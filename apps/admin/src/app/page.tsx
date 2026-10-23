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

type BillingPlan = {
  code: string;
  name: string;
  maxUsers: number;
  llmTokenCapMonthly: number;
};

type BillingSub = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  planCode: string;
  planName: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  commerciallyActive: boolean;
};

type OpsStatus = {
  principle: string;
  maintenanceMode: boolean;
  maintenanceReason: string | null;
  currentVersion: {
    version: string;
    title: string;
    channel: string;
  } | null;
};

type ProductVersionRow = {
  id: string;
  version: string;
  title: string;
  channel: string;
  releaseNotes: string;
  current: boolean;
  releasedAt: string;
};

type OpsJournalRow = {
  id: string;
  kind: string;
  message: string;
  createdAt: string;
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
  const [billingPlans, setBillingPlans] = useState<BillingPlan[]>([]);
  const [billingSubs, setBillingSubs] = useState<BillingSub[]>([]);
  const [billingPrinciple, setBillingPrinciple] = useState<string | null>(null);
  const [activatePlanCode, setActivatePlanCode] = useState("atlas-starter-fictif");
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null);
  const [opsVersions, setOpsVersions] = useState<ProductVersionRow[]>([]);
  const [opsJournal, setOpsJournal] = useState<OpsJournalRow[]>([]);
  const [maintReason, setMaintReason] = useState(
    "[FICTIF] Fenêtre de maintenance démo",
  );
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
    const roles = user?.staffRoles ?? [];
    const isBillingOnly =
      roles.includes("billing") &&
      !roles.some((r) => ["admin", "ops", "support", "approver"].includes(r));
    const canBilling = roles.some((r) =>
      ["billing", "admin", "ops"].includes(r),
    );
    const canOps = roles.some((r) =>
      ["ops", "admin", "support"].includes(r),
    );

    if (canOps) {
      const [st, vers, journal] = await Promise.all([
        fetch(`${API}/v1/admin/ops/status`, { headers: headers() }).then((x) =>
          x.json(),
        ),
        fetch(`${API}/v1/admin/ops/versions`, { headers: headers() }).then(
          (x) => x.json(),
        ),
        fetch(`${API}/v1/admin/ops/journal?limit=15`, {
          headers: headers(),
        }).then((x) => x.json()),
      ]);
      if (st?.principle) setOpsStatus(st);
      setOpsVersions(Array.isArray(vers) ? vers : []);
      setOpsJournal(Array.isArray(journal) ? journal : []);
    }

    if (canBilling) {
      const [plans, subs, billingTenants] = await Promise.all([
        fetch(`${API}/v1/admin/billing/plans`, { headers: headers() }).then(
          (x) => x.json(),
        ),
        fetch(`${API}/v1/admin/billing/subscriptions`, {
          headers: headers(),
        }).then((x) => x.json()),
        fetch(`${API}/v1/admin/billing/tenants`, { headers: headers() }).then(
          (x) => x.json(),
        ),
      ]);
      if (Array.isArray(plans)) {
        setBillingPlans(plans);
        if (plans[0]?.code) setActivatePlanCode(plans[0].code);
      }
      if (subs?.principle) setBillingPrinciple(subs.principle);
      setBillingSubs(Array.isArray(subs?.subscriptions) ? subs.subscriptions : []);
      if (Array.isArray(billingTenants)) {
        setTenants(billingTenants);
        if (!tenantId && billingTenants[0]) setTenantId(billingTenants[0].id);
      }
    }

    if (isBillingOnly) {
      setQueue([]);
      setRouting([]);
      setEntitlements(null);
      setTickets([]);
      return;
    }

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
  }, [token, headers, tenantId, user?.staffRoles]);

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
  const canBilling = user?.staffRoles?.some((r) =>
    ["billing", "admin", "ops"].includes(r),
  );
  const canMutateBilling = user?.staffRoles?.some((r) =>
    ["billing", "admin"].includes(r),
  );
  const canOps = user?.staffRoles?.some((r) =>
    ["ops", "admin", "support"].includes(r),
  );
  const canMutateOps = user?.staffRoles?.some((r) =>
    ["ops", "admin"].includes(r),
  );
  const blockedCount = queue.filter((q) => q.status === "blocked_no_route").length;

  async function setMaintenance(active: boolean) {
    setError(null);
    setMsg(null);
    const res = await fetch(`${API}/v1/admin/ops/maintenance`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        active,
        reason: active ? maintReason : undefined,
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
    setMsg(
      active
        ? "Maintenance ON — exécutions bloquées (POLICY_DENY)."
        : "Maintenance OFF — Policy Guard habituel.",
    );
    await refresh();
  }

  async function activateSubscription() {
    setError(null);
    setMsg(null);
    const res = await fetch(`${API}/v1/admin/billing/subscriptions/activate`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        tenantId,
        planCode: activatePlanCode,
        status: "active",
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
    setMsg(
      `Abonnement activé (${data.planCode}) pour ${data.tenantSlug} — licence ≠ autorisation pentest.`,
    );
    await refresh();
  }

  async function expireSubscription(id: string) {
    setError(null);
    setMsg(null);
    const res = await fetch(
      `${API}/v1/admin/billing/subscriptions/${id}/expire`,
      { method: "POST", headers: headers() },
    );
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
      `Abonnement ${data.tenantSlug} expiré — exécution bloquée (SUBSCRIPTION_INACTIVE).`,
    );
    await refresh();
  }

  async function stubPayment(id: string, outcome: "recorded" | "simulated_success" | "simulated_failure") {
    setError(null);
    setMsg(null);
    const res = await fetch(
      `${API}/v1/admin/billing/subscriptions/${id}/payment-stub`,
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          amountCents: 4900,
          outcome,
          note: "[FICTIF] Stub — aucun débit réel",
        }),
      },
    );
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
      `Paiement stub ${data.payment?.status} (${data.payment?.externalRef}) — pas de PSP réel.`,
    );
    await refresh();
  }

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
            approver@a.atlas.local / atlas-demo — support@… (refus approbation) ·
            billing@… (licences stub) · admin@… (import stub).
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

          {canOps && opsStatus && (
            <div className="panel">
              <h2>Versions / mises à jour / maintenance</h2>
              <p className="muted">{opsStatus.principle}</p>
              <div className="banner">
                Version courante :{" "}
                <code>
                  {opsStatus.currentVersion?.version ?? "—"}
                </code>
                {opsStatus.currentVersion
                  ? ` — ${opsStatus.currentVersion.title}`
                  : ""}
                {" · "}
                Maintenance :{" "}
                <strong>
                  {opsStatus.maintenanceMode ? "ON (exécutions bloquées)" : "OFF"}
                </strong>
                {opsStatus.maintenanceReason
                  ? ` — ${opsStatus.maintenanceReason}`
                  : ""}
              </div>
              {canMutateOps && (
                <>
                  <label>Raison maintenance</label>
                  <input
                    value={maintReason}
                    onChange={(e) => setMaintReason(e.target.value)}
                  />
                  {!opsStatus.maintenanceMode ? (
                    <button type="button" onClick={() => void setMaintenance(true)}>
                      Activer maintenance
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void setMaintenance(false)}
                    >
                      Lever maintenance
                    </button>
                  )}
                </>
              )}
              <h3>Catalogue versions</h3>
              <ul>
                {opsVersions.map((v) => (
                  <li key={v.id} className="item">
                    <div>
                      <strong>
                        {v.version}
                        {v.current ? " (courante)" : ""}
                      </strong>{" "}
                      <span className="muted">{v.channel}</span> — {v.title}
                    </div>
                    <p className="muted">{v.releaseNotes}</p>
                  </li>
                ))}
              </ul>
              <h3>Journal ops</h3>
              {opsJournal.length === 0 ? (
                <p className="muted">Aucune entrée.</p>
              ) : (
                <ul>
                  {opsJournal.map((j) => (
                    <li key={j.id} className="item">
                      <code>{j.kind}</code> — {j.message}{" "}
                      <span className="muted">
                        ({new Date(j.createdAt).toLocaleString("fr-FR")})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canBilling && (
            <div className="panel">
              <h2>Licences &amp; abonnements (stub)</h2>
              <p className="muted">
                {billingPrinciple ??
                  "Abonnement = droit logiciel. Jamais une autorisation de test."}
              </p>
              <div className="banner">
                Rôle <code>billing</code> : plans, activation, expiration,
                paiement <strong>stub</strong> (pas de PSP). Aucun accès RoE,
                jetons, findings ni preuves client. Une licence active{" "}
                <strong>n&apos;autorise jamais</strong> seule un contrôle.
              </div>
              <h3>Plans seed</h3>
              <ul>
                {billingPlans.map((p) => (
                  <li key={p.code} className="item">
                    <strong>{p.name}</strong>{" "}
                    <code>{p.code}</code> · max {p.maxUsers} users · LLM{" "}
                    {p.llmTokenCapMonthly.toLocaleString("fr-FR")} tok/mois
                  </li>
                ))}
              </ul>
              {canMutateBilling && (
                <>
                  <h3>Activer un abonnement</h3>
                  <label>Tenant</label>
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
                  <label>Plan</label>
                  <select
                    value={activatePlanCode}
                    onChange={(e) => setActivatePlanCode(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      background: "#10161d",
                      color: "#e8eef4",
                      border: "1px solid #2a3542",
                    }}
                  >
                    {billingPlans.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void activateSubscription()}>
                    Activer (commercial)
                  </button>
                </>
              )}
              <h3>Abonnements tenants</h3>
              {billingSubs.length === 0 ? (
                <p className="muted">Aucun abonnement.</p>
              ) : (
                <ul>
                  {billingSubs.map((s) => (
                    <li key={s.id} className="item">
                      <div>
                        <strong>{s.tenantName}</strong>{" "}
                        <span className="muted">({s.tenantSlug})</span>
                      </div>
                      <div className="muted">
                        {s.planCode} / {s.status}
                        {s.endsAt
                          ? ` · fin ${new Date(s.endsAt).toLocaleDateString("fr-FR")}`
                          : " · sans fin"}{" "}
                        →{" "}
                        {s.commerciallyActive
                          ? "licence OK (insuffisante seule)"
                          : "licence inactive"}
                      </div>
                      {canMutateBilling && (
                        <>
                          {s.commerciallyActive && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => void expireSubscription(s.id)}
                            >
                              Expirer
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void stubPayment(s.id, "recorded")}
                          >
                            Stub paiement
                          </button>
                          {s.status === "past_due" && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() =>
                                void stubPayment(s.id, "simulated_success")
                              }
                            >
                              Simuler succès
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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
