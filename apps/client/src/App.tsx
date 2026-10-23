import { useEffect, useMemo, useState } from "react";

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

type Mission = {
  id: string;
  title: string;
  status: string;
  blockedReason?: string | null;
  synthetic: boolean;
  findings?: { title: string; summary: string; severity: string }[];
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
};

function needBadge(status?: string) {
  if (status === "usable") return "Utilisable";
  if (status === "coming_soon") return "Bientôt";
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
  const [selectedNeed, setSelectedNeed] = useState("web_presence");
  const [chat, setChat] = useState("Que voit-on de nous sur Internet ?");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const headers = useMemo(
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
      setError(String(data.message ?? "Échec"));
      return;
    }
    setToken(data.accessToken);
  }

  async function refresh() {
    if (!token) return;
    const [n, a, m, c, g] = await Promise.all([
      fetch(`${API}/v1/ux-needs`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/assets`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/missions`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors/catalog`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors`, { headers }).then((r) => r.json()),
    ]);
    setNeeds(n);
    setAssets(a);
    setMissions(m);
    setCatalog(Array.isArray(c) ? c : []);
    setGrants(Array.isArray(g) ? g : []);
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

  async function createAndRunDemo() {
    setBusy(true);
    setError(null);
    try {
      if (selectedNeed !== "web_presence") {
        setError("Seul le besoin « présence web » est exécutable dans ce MVP.");
        return;
      }
      const webGrant = grants.find(
        (g) => g.connectorId === "web.passive.presence" && g.status === "active",
      );
      if (!webGrant) {
        await connectConnector("web.passive.presence");
      }
      if (assets.length === 0) {
        await addAsset();
      }
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const latestReport = missions.find((m) => m.reports && m.reports.length > 0);
  const selected = needs.find((n) => n.id === selectedNeed);

  return (
    <div className="shell">
      <p className="brand">Atlas</p>
      <p className="tagline">
        Assistant de pentest autorisé — conversation guidée, connecteurs
        révocables, contrôles déterministes. L&apos;IA ne s&apos;auto-accorde
        pas de droits.
      </p>
      <div className="banner">
        <strong>Données de démonstration</strong> — aucune cible réelle.
        Abonnement ≠ autorisation. États UX honnêtes : pas de faux « terminé ».
      </div>

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
        <div className="grid two">
          <section>
            <h2>Conversation guidée</h2>
            <p className="muted">
              LLM mock — oriente vers modules/connecteurs, jamais d&apos;exécution.
            </p>
            <textarea
              rows={3}
              value={chat}
              onChange={(e) => setChat(e.target.value)}
            />
            <button type="button" onClick={() => void ask()}>
              Demander conseil
            </button>
            {chatReply && <pre>{chatReply}</pre>}

            <h2>Cinq besoins</h2>
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
                <div className="muted">{n.statusLabel ?? n.note}</div>
              </div>
            ))}
            {selected && !selected.mvpReady && (
              <p className="muted">
                Ce besoin n&apos;est pas exécutable : {selected.statusLabel}. Aucune
                mission ne sera lancée sous un faux statut « terminé ».
              </p>
            )}
          </section>

          <section>
            <h2>Connecteurs</h2>
            <p className="muted">
              Permissions révocables. Stub GitHub = mock OAuth non production.
            </p>
            <ul>
              {catalog.map((c) => {
                const grant = grants.find(
                  (g) => g.connectorId === c.id && g.status === "active",
                );
                return (
                  <li key={c.id} className="need">
                    <strong>
                      {c.label}{" "}
                      {c.isStub && <span className="muted">[STUB]</span>}
                      {!c.productionReady && !c.isStub && (
                        <span className="muted">[non prod]</span>
                      )}
                    </strong>
                    <div className="muted">{c.statusLabel}</div>
                    {c.disclaimer && (
                      <div className="muted">{c.disclaimer}</div>
                    )}
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
                        {c.isStub ? "Connecter (mock OAuth)" : "Connecter"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <h2>Actifs</h2>
            <ul>
              {assets.map((a) => (
                <li key={a.id}>
                  {a.value}{" "}
                  {a.synthetic && <span className="muted">[FICTIF]</span>}
                </li>
              ))}
            </ul>
            <button type="button" className="ghost" onClick={() => void addAsset()}>
              Ajouter actif démo
            </button>

            <h2>Mission</h2>
            <button
              type="button"
              disabled={busy || selectedNeed !== "web_presence"}
              onClick={() => void createAndRunDemo()}
            >
              {busy ? "Exécution…" : "Mission démo présence web"}
            </button>
            <button type="button" className="ghost" onClick={() => void refresh()}>
              Rafraîchir
            </button>
            <ul>
              {missions.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <strong>{m.title}</strong> — {m.status}
                  {m.blockedReason && (
                    <div className="muted">{m.blockedReason}</div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {latestReport?.jobRuns?.[0] && (
        <section>
          <h2>Progression job</h2>
          <p className="muted">
            {latestReport.jobRuns[0].status} —{" "}
            {latestReport.jobRuns[0].progressPercent}%{" "}
            {latestReport.jobRuns[0].progressMessage}
          </p>
        </section>
      )}

      {latestReport?.reports?.[0] && (
        <section className="report">
          <h2>Bilan décideur</h2>
          <p>{latestReport.reports[0].executiveSummary}</p>
          <h2>Détail technique</h2>
          <p>{latestReport.reports[0].technicalDetail}</p>
        </section>
      )}

      {info && <p className="muted">{info}</p>}
      {error && <p style={{ color: "var(--alert)" }}>{error}</p>}
    </div>
  );
}
