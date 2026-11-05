import { useEffect, useMemo, useState } from "react";
import {
  EXECUTABLE_NEED,
  evaluateScannerReadiness,
} from "./scannerReadiness";
import {
  buildUnifiedResults,
  type UnifiedResultRow,
} from "./unifiedResults";
import {
  REPORT_EXPORT_FORMATS,
  filenameFromDisposition,
  reportExportUrl,
  triggerBlobDownload,
  type ReportExportFormat,
} from "./reportExport";
import {
  DEFAULT_REAL_TARGET,
  canClientExecute,
  circuitAPendingMessage,
  createMissionBody,
  validateRealMissionInput,
  type ScannerMissionMode,
} from "./scannerMissionPath";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
  remediationStatus?: string;
  remediationNote?: string | null;
  remediatedAt?: string | null;
  mission?: { id: string; title: string };
};

type Mission = {
  id: string;
  title: string;
  status: string;
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
};

const REMEDIATION_OPTIONS = [
  "open",
  "in_progress",
  "fixed",
  "accepted_risk",
  "wont_fix",
  "retest_requested",
] as const;

const KIND_LABEL: Record<UnifiedResultRow["kind"], string> = {
  service: "Service",
  finding: "Finding",
  report: "Bilan",
};

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

export function App() {
  const [email, setEmail] = useState("owner@demo.atlas.local");
  const [password, setPassword] = useState("atlas-demo");
  const [token, setToken] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [grants, setGrants] = useState<ConnectorGrant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [roeMissionId, setRoeMissionId] = useState<string | null>(null);
  const [roe, setRoe] = useState<Roe | null>(null);
  const [roeExclusions, setRoeExclusions] = useState("mail.example.com");
  const [findings, setFindings] = useState<Finding[]>([]);
  /** FICTIF remains the default demo path; real requires Paradise attestation. */
  const [missionMode, setMissionMode] = useState<ScannerMissionMode>("fictif");
  const [paradiseAttestation, setParadiseAttestation] = useState("");
  const [realTargetHost, setRealTargetHost] = useState(DEFAULT_REAL_TARGET);

  const headers = useMemo(
    () =>
      ({
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      }) as Record<string, string>,
    [token],
  );

  const webGrantActive = grants.some(
    (g) => g.connectorId === "web.passive.presence" && g.status === "active",
  );
  const readiness = evaluateScannerReadiness({
    authenticated: Boolean(token),
    selectedNeedId: EXECUTABLE_NEED,
    assetCount: assets.length,
    webConnectorActive: webGrantActive,
  });

  const unified = buildUnifiedResults(missions, findings);
  const hasRealMission = missions.some((m) => m.synthetic === false);
  const [exportBusyKey, setExportBusyKey] = useState<string | null>(null);

  async function downloadReportExport(
    missionId: string,
    reportId: string,
    format: ReportExportFormat,
  ) {
    if (!token) return;
    const key = `${reportId}:${format}`;
    setExportBusyKey(key);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        reportExportUrl(API, missionId, reportId, format),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        let message = `Export ${format} impossible (${res.status})`;
        try {
          const data = (await res.json()) as { message?: unknown };
          if (typeof data.message === "string") message = data.message;
        } catch {
          /* non-JSON error body */
        }
        setError(message);
        return;
      }
      const blob = await res.blob();
      const filename = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        reportId,
        format,
      );
      triggerBlobDownload(blob, filename);
      const fictif = res.headers.get("X-Atlas-Synthetic") === "true";
      setInfo(
        fictif
          ? `Export ${format.toUpperCase()} téléchargé (marqué FICTIF).`
          : `Export ${format.toUpperCase()} téléchargé.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusyKey(null);
    }
  }

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
    const [a, m, c, g, f] = await Promise.all([
      fetch(`${API}/v1/assets`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/missions`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors/catalog`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/findings`, { headers }).then((r) => r.json()),
    ]);
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

  async function ensureAsset(
    value: string,
    synthetic: boolean,
  ): Promise<Asset> {
    const assetList = (await fetch(`${API}/v1/assets`, { headers }).then((r) =>
      r.json(),
    )) as Asset[];
    const normalized = value.trim().toLowerCase().replace(/\.$/, "");
    const existing = assetList.find(
      (a) =>
        a.normalized.toLowerCase() === normalized ||
        a.value.toLowerCase() === normalized,
    );
    if (existing) return existing;
    const created = await fetch(`${API}/v1/assets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "domain", value: normalized, synthetic }),
    }).then((r) => r.json());
    if (!created?.id) {
      throw new Error(
        typeof created?.message === "string"
          ? created.message
          : "Création d'actif impossible",
      );
    }
    return created as Asset;
  }

  /**
   * Scanner CTA: FICTIF (default) = mock owner-auth + execute.
   * Mission réelle = synthetic:false + Paradise attach — stops for Circuit A
   * (admin decide). Does not weaken Policy Guard; no auto-execute on real path.
   */
  async function runScanner() {
    if (!readiness.ready) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (missionMode === "fictif") {
        const assetList = (await fetch(`${API}/v1/assets`, {
          headers,
        }).then((r) => r.json())) as Asset[];
        if (!assetList[0]) {
          setError("Aucun actif — ajoutez une cible (options avancées).");
          return;
        }
        const mission = await fetch(`${API}/v1/missions`, {
          method: "POST",
          headers,
          body: JSON.stringify(
            createMissionBody({
              mode: "fictif",
              assetId: assetList[0].id,
              uxNeedId: EXECUTABLE_NEED,
            }),
          ),
        }).then((r) => r.json());
        if (!mission?.id) {
          setError(
            typeof mission?.message === "string"
              ? mission.message
              : JSON.stringify(mission?.message ?? mission),
          );
          return;
        }

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
        return;
      }

      const validated = validateRealMissionInput({
        paradiseAttestation,
        targetHost: realTargetHost,
      });
      if (!validated.ok) {
        setError(validated.reason);
        return;
      }

      const asset = await ensureAsset(validated.targetHost, false);
      const mission = await fetch(`${API}/v1/missions`, {
        method: "POST",
        headers,
        body: JSON.stringify(
          createMissionBody({
            mode: "real",
            assetId: asset.id,
            uxNeedId: EXECUTABLE_NEED,
          }),
        ),
      }).then((r) => r.json());
      if (!mission?.id) {
        setError(
          typeof mission?.message === "string"
            ? mission.message
            : JSON.stringify(mission?.message ?? mission),
        );
        return;
      }

      const attached = await fetch(
        `${API}/v1/missions/${mission.id}/owner-authorization/attach`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            paradiseAttestation: validated.attestation,
            signerLabel: email,
          }),
        },
      ).then((r) => r.json());
      if (!attached?.id && attached?.message) {
        setError(
          typeof attached.message === "string"
            ? attached.message
            : JSON.stringify(attached.message),
        );
        await refresh();
        return;
      }

      const status = String(attached?.status ?? mission.status ?? "?");
      if (canClientExecute(status)) {
        setInfo(
          `Mission ${attached.id ?? mission.id} → ${status}. Circuit A déjà satisfait — vous pouvez « Exécuter ».`,
        );
      } else {
        setInfo(
          circuitAPendingMessage(String(attached?.id ?? mission.id), status),
        );
      }
      setParadiseAttestation("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** After Circuit A admin approve — operator re-clicks execute (real path only). */
  async function executeMission(missionId: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const run = await fetch(`${API}/v1/missions/${missionId}/execute`, {
        method: "POST",
        headers,
      }).then((r) => r.json());
      if (run.message && !run.id && !run.gate) {
        setError(
          typeof run.message === "string"
            ? run.message
            : JSON.stringify(run.message),
        );
      } else if (run.gate?.decision === "REJECT") {
        setError(`${run.gate.code}: ${run.gate.reason}`);
      } else {
        setInfo(`Exécution lancée pour ${missionId}.`);
      }
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
      <div className={hasRealMission ? "banner banner-real" : "banner"}>
        {hasRealMission ? (
          <>
            <strong>Mission réelle présente</strong> — exports non marqués
            FICTIF disponibles sur les bilans. Abonnement ≠ autorisation.
          </>
        ) : (
          <>
            <strong>Données de démonstration</strong> — aucune cible réelle.
            Abonnement ≠ autorisation. Pas de faux « terminé » sur besoins non
            branchés.
          </>
        )}
      </div>

      <section className="scanner-hero" aria-labelledby="scanner-cta-title">
        <h2 id="scanner-cta-title">Scanner</h2>
        <p className="muted">
          Contrôle passif in-scope uniquement. Exécution refusée sans session,
          cible, connecteur et autorisation valides.
        </p>
        <label className="mode-toggle">
          <input
            type="checkbox"
            checked={missionMode === "real"}
            onChange={(e) =>
              setMissionMode(e.target.checked ? "real" : "fictif")
            }
          />{" "}
          Mission réelle (Paradise attach — pas FICTIF)
        </label>
        {missionMode === "real" ? (
          <div className="real-mission-fields">
            <label htmlFor="real-target">Cible FQDN (allowlist RoE)</label>
            <input
              id="real-target"
              value={realTargetHost}
              onChange={(e) => setRealTargetHost(e.target.value)}
              placeholder={DEFAULT_REAL_TARGET}
              autoComplete="off"
            />
            <label htmlFor="paradise-attestation">
              Attestation Paradise (jeton compact fourni par l&apos;opérateur)
            </label>
            <textarea
              id="paradise-attestation"
              rows={3}
              value={paradiseAttestation}
              onChange={(e) => setParadiseAttestation(e.target.value)}
              placeholder="coller paradiseAttestation ici"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="muted real-mission-note">
              Après attach : Circuit A reste obligatoire (admin
              approvals/decide). Le Scanner ne court-circuite pas Policy Guard.
            </p>
          </div>
        ) : (
          <p className="muted">
            Par défaut : parcours FICTIF (mock owner-auth + A_SKIPPED_DEMO).
          </p>
        )}
        <button
          type="button"
          className="cta-scanner"
          disabled={
            busy ||
            !readiness.ready ||
            (missionMode === "real" && paradiseAttestation.trim().length < 8)
          }
          onClick={() => void runScanner()}
        >
          {busy
            ? missionMode === "real"
              ? "Attachement…"
              : "Exécution…"
            : missionMode === "real"
              ? "Attacher & préparer"
              : "Scanner"}
        </button>
        {readiness.blockReason && (
          <p className="block-reason" role="status">
            {readiness.blockReason}
          </p>
        )}
        {missions.some(
          (m) =>
            !m.synthetic &&
            (m.status === "A_APPROVAL_PENDING" || canClientExecute(m.status)),
        ) && (
          <ul className="circuit-a-queue" aria-label="Missions réelles">
            {missions
              .filter(
                (m) =>
                  !m.synthetic &&
                  (m.status === "A_APPROVAL_PENDING" ||
                    canClientExecute(m.status)),
              )
              .map((m) => (
                <li key={m.id}>
                  <span>
                    {m.title} — <code>{m.status}</code>
                  </span>
                  {m.status === "A_APPROVAL_PENDING" ? (
                    <span className="muted">
                      {" "}
                      En attente Circuit A (admin)
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={() => void executeMission(m.id)}
                    >
                      Exécuter
                    </button>
                  )}
                </li>
              ))}
          </ul>
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
          <section aria-labelledby="results-title">
            <h2 id="results-title">Résultats</h2>
            <p className="muted">
              Services (contrôles) et findings ensemble — pas de silo par
              connecteur. Remédiation sur chaque finding.
            </p>
            {unified.length === 0 ? (
              <p className="muted">Aucun résultat pour l&apos;instant.</p>
            ) : (
              <ul className="results-list">
                {unified.map((row) => {
                  const finding =
                    row.kind === "finding"
                      ? findings.find((f) => `finding:${f.id}` === row.id)
                      : undefined;
                  return (
                    <li key={row.id} className="result-row">
                      <span className={`kind kind-${row.kind}`}>
                        {KIND_LABEL[row.kind]}
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
                      {row.kind === "report" &&
                        row.missionId &&
                        row.reportId && (
                          <div
                            className="export-actions"
                            role="group"
                            aria-label={`Exporter le bilan ${row.reportId}`}
                          >
                            {REPORT_EXPORT_FORMATS.map((fmt) => {
                              const busyKey = `${row.reportId}:${fmt}`;
                              return (
                                <button
                                  key={fmt}
                                  type="button"
                                  className="ghost export-btn"
                                  disabled={
                                    busy || exportBusyKey === busyKey
                                  }
                                  onClick={() =>
                                    void downloadReportExport(
                                      row.missionId!,
                                      row.reportId!,
                                      fmt,
                                    )
                                  }
                                >
                                  {exportBusyKey === busyKey
                                    ? `… ${fmt.toUpperCase()}`
                                    : fmt.toUpperCase()}
                                </button>
                              );
                            })}
                            {!row.synthetic && (
                              <span className="muted export-hint">
                                Rapport réel (non FICTIF)
                              </span>
                            )}
                          </div>
                        )}
                      {finding && (
                        <>
                          <label>Remédiation</label>
                          <select
                            value={finding.remediationStatus ?? "open"}
                            onChange={(e) =>
                              void updateRemediation(finding.id, e.target.value)
                            }
                          >
                            {REMEDIATION_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </li>
                  );
                })}
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
            <summary>Options avancées (RoE, connecteurs, actifs)</summary>
            <section>
              <h3>Connecteurs</h3>
              <ul>
                {catalog
                  .filter((c) => c.id === "web.passive.presence")
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
          </details>
        </>
      )}

      {info && <p className="muted">{info}</p>}
      {error && <p style={{ color: "var(--alert)" }}>{error}</p>}
    </div>
  );
}
