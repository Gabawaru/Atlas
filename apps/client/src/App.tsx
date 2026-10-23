import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

type Need = {
  id: string;
  label: string;
  mvpReady: boolean;
  note: string;
};

type Asset = { id: string; value: string; normalized: string; synthetic: boolean };
type Mission = {
  id: string;
  title: string;
  status: string;
  blockedReason?: string | null;
  synthetic: boolean;
  findings?: { title: string; summary: string; severity: string }[];
  reports?: {
    executiveSummary: string;
    technicalDetail: string;
    synthetic: boolean;
  }[];
};

export function App() {
  const [email, setEmail] = useState("owner@demo.atlas.local");
  const [password, setPassword] = useState("atlas-demo");
  const [token, setToken] = useState<string | null>(null);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedNeed, setSelectedNeed] = useState("web_presence");
  const [chat, setChat] = useState("Que voit-on de nous sur Internet ?");
  const [chatReply, setChatReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const [n, a, m] = await Promise.all([
      fetch(`${API}/v1/ux-needs`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/assets`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/missions`, { headers }).then((r) => r.json()),
    ]);
    setNeeds(n);
    setAssets(a);
    setMissions(m);
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
    setChatReply(`${res.reply}\n\n(${res.disclaimer})`);
  }

  async function addAsset() {
    await fetch(`${API}/v1/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "domain",
        value: "demo.atlas.local",
        synthetic: true,
      }),
    });
    await refresh();
  }

  async function createAndRunDemo() {
    setBusy(true);
    setError(null);
    try {
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

  return (
    <div className="shell">
      <p className="brand">Atlas</p>
      <p className="tagline">
        Assistant de pentest autorisé — conversation guidée, contrôles
        déterministes, jamais d&apos;auto-autorisation par l&apos;IA.
      </p>
      <div className="banner">
        <strong>Données de démonstration</strong> — aucune cible réelle. Abonnement ≠
        autorisation de tester. Client web React ; shell Tauri documenté (stub) pour
        le desktop multi-OS.
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
            <p className="muted">LLM mock — propositions seulement.</p>
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
                    disabled={!n.mvpReady}
                    checked={selectedNeed === n.id}
                    onChange={() => setSelectedNeed(n.id)}
                  />{" "}
                  {n.label}
                </label>
                <div className="muted">{n.note}</div>
              </div>
            ))}
          </section>

          <section>
            <h2>Actifs connectés</h2>
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
            <p className="muted">
              Démo synthétique : circuit A skippable. Mission réelle sans
              approbateur configuré → BLOCKED.
            </p>
            <button
              type="button"
              disabled={busy || selectedNeed !== "web_presence"}
              onClick={() => void createAndRunDemo()}
            >
              {busy ? "Exécution…" : "Demander mission démo + bilans"}
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

      {latestReport?.reports?.[0] && (
        <section className="report">
          <h2>Bilan décideur</h2>
          <p>{latestReport.reports[0].executiveSummary}</p>
          <h2>Détail technique</h2>
          <p>{latestReport.reports[0].technicalDetail}</p>
          {latestReport.findings?.map((f) => (
            <div key={f.title} className="need">
              <strong>
                [{f.severity}] {f.title}
              </strong>
              <div className="muted">{f.summary}</div>
            </div>
          ))}
        </section>
      )}

      {error && <p style={{ color: "var(--alert)" }}>{error}</p>}
    </div>
  );
}
