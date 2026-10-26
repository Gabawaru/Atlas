import { useEffect, useMemo, useState } from "react";
import {
  EXECUTABLE_NEED,
  evaluateScannerReadiness,
} from "./scannerReadiness";
import {
  buildUnifiedResults,
  kindLabel,
  type UnifiedResultRow,
} from "./unifiedResults";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Need = {
  id: string;
  label: string;
  mvpReady: boolean;
  status?: string;
  statusLabel?: string;
  note: string;
  connectorIds?: string[];
};

type Asset = { id: string; value: string; normalized: string; synthetic: boolean };
type ConnectorGrant = {
  id: string;
  connectorId: string;
  status: string;
  isStub: boolean;
  productionReady: boolean;
  catalog?: { label: string; statusLabel: string } | null;
};
type CatalogEntry = {
  id: string;
  label: string;
  description: string;
  productionReady: boolean;
  isStub: boolean;
  statusLabel: string;
  disclaimer?: string;
};

type Finding = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  synthetic?: boolean;
  confidence?: string | null;
  cveId?: string | null;
  kevListed?: boolean;
  feedSources?: string[];
  matchDisclaimer?: string | null;
  remediationStatus?: string;
  remediationNote?: string | null;
  remediatedAt?: string | null;
  mission?: { id: string; title: string };
};

type Mission = {
  id: string;
  title: string;
  status: string;
  blockedReason?: string | null;
  synthetic: boolean;
  findings?: Finding[];
  jobRuns?: {
    id: string;
    status: string;
    progressPercent: number;
    progressMessage?: string | null;
  }[];
  reports?: {
    id: string;
    executiveSummary: string;
    technicalDetail: string;
    synthetic: boolean;
  }[];
  scopeVersions?: {
    version: number;
    scopeHash: string;
    exclusions?: string[];
    methods?: string[];
    periodStart?: string;
    periodEnd?: string;
  }[];
  ownerAuths?: {
    status: string;
    signerLabel: string;
    counterpartyLabel?: string | null;
    ownerSignedAt?: string | null;
    counterpartySignedAt?: string | null;
  }[];
};

const REMEDIATION_OPTIONS = [
  "open",
  "in_progress",
  "fixed",
  "accepted_risk",
  "wont_fix",
  "retest_requested",
] as const;

type Roe = {
  version: number;
  scopeHash: string;
  assetIds: string[];
  exclusions: string[];
  methods: string[];
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
};

function needBadge(status?: string) {
  if (status === "usable") return "OK démo";
  if (status === "coming_soon") return "Partiel";
  return "Non branché";
}

export function App() {
  const [email, setEmail] = useState("owner@demo.atlas.local");
  const [password, setPassword] = useState("atlas-demo");
  const [token, setToken] = useState<string | null>(null);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [grants, setGrants] = useState<ConnectorGrant[]>([]);
  const [selectedNeed, setSelectedNeed] = useState(EXECUTABLE_NEED);
  const [chat, setChat] = useState("Que voit-on de nous sur Internet ?");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [roeMissionId, setRoeMissionId] = useState<string | null>(null);
  const [roe, setRoe] = useState<Roe | null>(null);
  const [roeExclusions, setRoeExclusions] = useState("mail.example.com");
  const [findings, setFindings] = useState<Finding[]>([]);

  const headers = useMemo(
    () =>
      ({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }) as Record<string, string>,
    [token],
  );

  const selected = needs.find((n) => n.id === selectedNeed);
  const webGrantActive = grants.some(
    (g) => g.connectorId === "web.passive.presence" && g.status === "active",
  );
  const readiness = evaluateScannerReadiness({
    authenticated: Boolean(token),
    selectedNeedId: selectedNeed,
    needExecutable: selected?.mvpReady ?? selectedNeed === EXECUTABLE_NEED,
    assetCount: assets.length,
    webConnectorActive: webGrantActive,
  });

  const unified: UnifiedResultRow[] = useMemo(
    () => buildUnifiedResults(missions, findings),
    [missions, findings],
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
      setError(String(data.message ?? "Échec"));
      return;
    }
    setToken(data.accessToken);
  }

  async function refresh() {
    if (!token) return;
    const [n, a, m, c, g, f] = await Promise.all([
      fetch(`${API}/v1/ux-needs`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/assets`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/missions`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors/catalog`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/findings`, { headers }).then((r) => r.json()),
    ]);
    setNeeds(n);
    setAssets(a);
    setMissions(m);
    setCatalog(Array.isArray(c) ? c : []);
    setGrants(Array.isArray(g) ? g : []);
    setFindings(Array.isArray(f) ? f : []);
  }

  async function updateRemediation(findingId: string, status: string) {
    setInfo(null);
    setError(null);
    const res = await fetch(`${API}/v1/findings/${findingId}/remediation`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        remediationStatus: status,
        remediationNote: `Mise à jour client démo → ${status}`,
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
    setInfo(`Finding « ${data.title} » → remédiation ${status}`);
    await refresh();
  }

  useEffect(() => {
    if (token) void refresh();
  }, [token]);

  async function ask() {
    const res = await fetch(`${API}/v1/conversation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: chat }),
    }).then((r) => r.json());
    const lines = [
      res.reply,
      res.recommendedNeed ? `Besoin orienté : ${res.recommendedNeed}` : null,
      res.recommendedConnectors?.length
        ? `Connecteurs suggérés : ${res.recommendedConnectors.join(", ")}`
        : null,
      res.executed === false
        ? "Exécution : non (assistant ≠ Policy Guard)"
        : null,
      res.llm ? `Provider LLM : ${res.llm}` : null,
      `(${res.disclaimer})`,
    ].filter(Boolean);
    setChatReply(lines.join("\n\n"));
    if (res.recommendedNeed) setSelectedNeed(res.recommendedNeed);
  }

  async function addAsset() {
    await fetch(`${API}/v1/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "domain",
        value: "example.com",
        synthetic: true,
      }),
    });
    await refresh();
  }

  async function connectConnector(connectorId: string) {
    setInfo(null);
    setError(null);
    const res = await fetch(`${API}/v1/connectors/connect`, {
      method: "POST",
      headers,
      body: JSON.stringify({ connectorId }),
    }).then((r) => r.json());
    if (res.warning) setInfo(res.warning);
    await refresh();
  }

  async function revokeGrant(grantId: string) {
    setInfo(null);
    await fetch(`${API}/v1/connectors/${grantId}/revoke`, {
      method: "POST",
      headers,
    });
    setInfo("Connecteur révoqué — Policy Guard refusera les exécutions dépendantes.");
    await refresh();
  }

  /** Parcours démo autorisé : mission + signatures mock + execute (Policy Guard). Pas d'agressif. */
  async function runScanner() {
    if (!readiness.ready) return;
    setBusy(true);
    setError(null);
    try {
      const assetList = await fetch(`${API}/v1/assets`, { headers }).then((r) =>
        r.json(),
      );
      const mission = await fetch(`${API}/v1/missions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "[FICTIF] Mission présence web",
          uxNeedIds: [selectedNeed],
          assetIds: [assetList[0].id],
          synthetic: true,
          exclusions: ["mail.example.com"],
          notes: "RoE démo — exclusions machine-readable",
        }),
      }).then((r) => r.json());

      await fetch(`${API}/v1/missions/${mission.id}/owner-authorization`, {
        method: "POST",
        headers,
        body: JSON.stringify({ signerLabel: "Camille Client (FICTIF)" }),
      }).then((r) => r.json());

      const run = await fetch(`${API}/v1/missions/${mission.id}/execute`, {
        method: "POST",
        headers,
      }).then((r) => r.json());

      if (run.gate?.decision === "REJECT") {
        setError(`${run.gate.code}: ${run.gate.reason}`);
      }
      setRoeMissionId(mission.id);
      const roeData = await fetch(`${API}/v1/missions/${mission.id}/roe`, {
        headers,
      }).then((r) => r.json());
      setRoe(roeData);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadRoe(missionId: string) {
    setRoeMissionId(missionId);
    const data = await fetch(`${API}/v1/missions/${missionId}/roe`, {
      headers,
    }).then((r) => r.json());
    setRoe(data);
    setRoeExclusions((data.exclusions ?? []).join(", "));
  }

  async function bumpRoe() {
    if (!roeMissionId || !roe) return;
    setInfo(null);
    setError(null);
    const exclusions = roeExclusions
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const updated = await fetch(`${API}/v1/missions/${roeMissionId}/roe`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        assetIds: roe.assetIds,
        methods: roe.methods,
        exclusions,
        notes: "RoE modifié — signatures invalidées",
      }),
    }).then((r) => r.json());
    if (updated.message && !updated.id) {
      setError(JSON.stringify(updated.message));
      return;
    }
    setInfo(
      `RoE passé en v${updated.scopeVersions?.[0]?.version ?? "?"} — autorisations révoquées, re-signature (2 parties) requise.`,
    );
    await loadRoe(roeMissionId);
    await refresh();
  }

  return (
    <div className="shell">
      <p className="brand">Atlas</p>
      <p className="tagline">
        Scanner autorisé — un CTA, résultats unifiés. Policy Guard décide ;
        l&apos;IA n&apos;exécute rien.
      </p>
      <div className="banner">
        <strong>Données de démonstration</strong> — aucune cible réelle.
        Abonnement ≠ autorisation. Pas de faux « terminé » sur besoins non branchés.
      </div>

      <section className="scanner-hero" aria-labelledby="scanner-cta-title">
        <h2 id="scanner-cta-title">Scanner</h2>
        <p className="muted">
          Contrôle passif in-scope uniquement. Exécution refusée sans session,
          cible, connecteur et autorisation valides.
        </p>
        <button
          type="button"
          className="cta-scanner"
          disabled={busy || !readiness.ready}
          onClick={() => void runScanner()}
        >
          {busy ? "Exécution…" : "Scanner"}
        </button>
        {!token && (
          <button type="button" className="ghost" onClick={() => void login()}>
            Se connecter pour activer
          </button>
        )}
        {token && (
          <button type="button" className="ghost" onClick={() => void refresh()}>
            Rafraîchir
          </button>
        )}
        {readiness.blockReason && (
          <p className="block-reason" role="status">
            {readiness.blockReason}
          </p>
        )}
      </section>

      {!token ? (
        <section>
          <h2>Connexion</h2>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" onClick={() => void login()}>
            Entrer
          </button>
          <p className="muted">Compte seed : owner@demo.atlas.local / atlas-demo</p>
        </section>
      ) : (
        <>
          <section>
            <h2>Besoin</h2>
            <p className="muted">
              Un seul besoin exécutable en démo. Les autres restent visibles sans
              faux succès.
            </p>
            {needs.map((n) => (
              <div
                key={n.id}
                className={`need ${n.mvpReady ? "" : "disabled"}`}
              >
                <label>
                  <input
                    type="radio"
                    name="need"
                    checked={selectedNeed === n.id}
                    onChange={() => setSelectedNeed(n.id)}
                  />{" "}
                  {n.label}{" "}
                  <span className="muted">[{needBadge(n.status)}]</span>
                </label>
                {!n.mvpReady && (
                  <div className="muted">{n.statusLabel ?? n.note}</div>
                )}
              </div>
            ))}
          </section>

          <section className="results-unified" aria-labelledby="results-title">
            <h2 id="results-title">Résultats</h2>
            <p className="muted">
              Services (contrôles) et findings ensemble — pas de silo par
              connecteur.
            </p>
            {unified.length === 0 ? (
              <p className="muted">Aucun résultat pour l&apos;instant.</p>
            ) : (
              <ul className="results-list">
                {unified.map((row) => (
                  <li key={row.id} className="result-row">
                    <span className={`kind kind-${row.kind}`}>
                      {kindLabel(row.kind)}
                    </span>
                    <strong>
                      {row.title}{" "}
                      {row.synthetic && (
                        <span className="muted">[FICTIF]</span>
                      )}
                    </strong>
                    {row.severity && (
                      <div className="muted">Sévérité : {row.severity}</div>
                    )}
                    <div className="muted">{row.detail}</div>
                  </li>
                ))}
              </ul>
            )}
            {missions.some((m) => m.reports?.[0]?.technicalDetail) && (
              <details>
                <summary>Détail technique des bilans</summary>
                {missions.map((m) =>
                  m.reports?.map((r) => (
                    <p key={r.id} className="muted">
                      <strong>{m.title}</strong> — {r.technicalDetail}
                    </p>
                  )),
                )}
              </details>
            )}
          </section>

          <details>
            <summary>Options avancées (RoE, connecteurs, chat, remédiation)</summary>
            <section>
              <h3>Conversation (mock — n&apos;exécute pas)</h3>
              <textarea
                rows={2}
                value={chat}
                onChange={(e) => setChat(e.target.value)}
              />
              <button type="button" className="ghost" onClick={() => void ask()}>
                Demander conseil
              </button>
              {chatReply && <pre>{chatReply}</pre>}
            </section>
            <section>
              <h3>Connecteurs</h3>
              <ul>
                {catalog
                  .filter((c) => c.id === "web.passive.presence" || c.isStub)
                  .map((c) => {
                    const grant = grants.find(
                      (g) => g.connectorId === c.id && g.status === "active",
                    );
                    return (
                      <li key={c.id} className="need">
                        <strong>
                          {c.label}{" "}
                          {c.isStub && <span className="muted">[STUB]</span>}
                        </strong>
                        <div className="muted">{c.statusLabel}</div>
                        {grant ? (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void revokeGrant(grant.id)}
                          >
                            Révoquer
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void connectConnector(c.id)}
                          >
                            Connecter
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
            <section>
              <h3>Actifs</h3>
              <ul>
                {assets.map((a) => (
                  <li key={a.id}>
                    {a.value}{" "}
                    {a.synthetic && <span className="muted">[FICTIF]</span>}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="ghost"
                onClick={() => void addAsset()}
              >
                Ajouter actif démo
              </button>
            </section>
            {roe && roeMissionId && (
              <section>
                <h3>RoE</h3>
                <pre>
                  {JSON.stringify(
                    {
                      version: roe.version,
                      exclusions: roe.exclusions,
                      methods: roe.methods,
                    },
                    null,
                    2,
                  )}
                </pre>
                <label>Exclusions</label>
                <input
                  value={roeExclusions}
                  onChange={(e) => setRoeExclusions(e.target.value)}
                />
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void bumpRoe()}
                >
                  Publier nouvelle version RoE
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void loadRoe(roeMissionId)}
                >
                  Recharger RoE
                </button>
              </section>
            )}
            {missions[0] && !roe && (
              <button
                type="button"
                className="ghost"
                onClick={() => void loadRoe(missions[0]!.id)}
              >
                Charger RoE mission récente
              </button>
            )}
            <section>
              <h3>Remédiation findings</h3>
              <p className="muted">
                FICTIF — ≠ ticket SAV côté A. Liste aussi dans Résultats ci-dessus.
              </p>
              {findings.length === 0 ? (
                <p className="muted">Aucun finding.</p>
              ) : (
                <ul>
                  {findings.map((f) => (
                    <li key={f.id} className="need">
                      <strong>
                        {f.title}{" "}
                        {f.synthetic && <span className="muted">[FICTIF]</span>}
                      </strong>
                      <div className="muted">
                        {f.severity}
                        {f.confidence ? ` · conf. ${f.confidence}` : ""}
                        {f.cveId ? ` · ${f.cveId}` : ""}
                      </div>
                      <label>Statut</label>
                      <select
                        value={f.remediationStatus ?? "open"}
                        onChange={(e) =>
                          void updateRemediation(f.id, e.target.value)
                        }
                      >
                        {REMEDIATION_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </details>
        </>
      )}

      {info && <p className="muted">{info}</p>}
      {error && <p style={{ color: "var(--alert)" }}>{error}</p>}
    </div>
  );
}
