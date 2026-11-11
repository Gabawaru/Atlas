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
  TEST_RESPONSIBILITY_LABEL,
  canClientExecute,
  circuitAPendingMessage,
  createMissionBody,
  validateRealMissionInput,
  type ScannerMissionMode,
} from "./scannerMissionPath";
import {
  formatAuthorizedLaunchBanner,
  parseAuthorizedLaunch,
  type AuthorizedLaunchIntent,
} from "./authorizedLaunch";
import {
  riskTableFromReportExport,
  type RiskTableRow,
} from "./riskTable";
import { VulnTrackingView } from "./VulnTrackingView";
import { SessionTerminalView } from "./SessionTerminalView";
import {
  ingestRiskTableIntoTracking,
  loadVulnTrackingStore,
  saveVulnTrackingStore,
  type VulnTrackingStore,
} from "./vulnTracking";
import {
  hashForRoute,
  parseSessionHash,
  type SessionRoute,
} from "./sessionRoute";
import { SessionTracePage } from "./SessionTracePage";
import {
  appendReportAvailable,
  appendScanOutcome,
  appendScanStarted,
  refusedScanJournalArgs,
} from "./sessionTraceLive";
import type { TraceBridge } from "./sessionTraceBridge";

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
    exportJson?: unknown;
    createdAt?: string;
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
  const missionMode: ScannerMissionMode = "real";
  const [realTargetHost, setRealTargetHost] = useState(DEFAULT_REAL_TARGET);
  /** Gate before scan — liability if scan turns out unauthorized. */
  const [testResponsibilityAccepted, setTestResponsibilityAccepted] =
    useState(false);
  /** RoE deep-link from atlas-secu.com (?action=&host=) — Scanner prefill only. */
  const [authorizedLaunch, setAuthorizedLaunch] =
    useState<AuthorizedLaunchIntent | null>(null);
  const [view, setView] = useState<SessionRoute>(() =>
    typeof window !== "undefined"
      ? parseSessionHash(window.location.hash)
      : "session",
  );
  const [vulnStore, setVulnStore] = useState<VulnTrackingStore>(() =>
    loadVulnTrackingStore(),
  );

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
    // Real path creates the asset on Scan — FQDN field counts as target intent.
    assetCount:
      assets.length > 0 || realTargetHost.trim().length >= 3
        ? Math.max(assets.length, 1)
        : 0,
    webConnectorActive: webGrantActive,
  });

  const unified = buildUnifiedResults(missions, findings);
  const [exportBusyKey, setExportBusyKey] = useState<string | null>(null);
  /** Durable journal bridge — same token as Scanner session. */
  const traceBridge: TraceBridge | null = token
    ? { apiBase: API, token }
    : null;

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
    let [a, m, c, g, f] = await Promise.all([
      fetch(`${API}/v1/assets`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/missions`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors/catalog`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/connectors`, { headers }).then((r) => r.json()),
      fetch(`${API}/v1/findings`, { headers }).then((r) => r.json()),
    ]);
    const grantsList = Array.isArray(g) ? g : [];
    const webActive = grantsList.some(
      (x: ConnectorGrant) =>
        x.connectorId === "web.passive.presence" && x.status === "active",
    );
    if (!webActive) {
      await fetch(`${API}/v1/connectors/connect`, {
        method: "POST",
        headers,
        body: JSON.stringify({ connectorId: "web.passive.presence" }),
      });
      g = await fetch(`${API}/v1/connectors`, { headers }).then((r) => r.json());
    }
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => setView(parseSessionHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parsed = parseAuthorizedLaunch(window.location.search);
    if (!parsed.ok) {
      if (parsed.reason) setError(parsed.reason);
      return;
    }
    setAuthorizedLaunch(parsed.intent);
    setRealTargetHost(parsed.intent.host);
    setInfo(formatAuthorizedLaunchBanner(parsed.intent));
  }, []);

  /** After login, land on Gabriel session hub unless a deep-link hash is set. */
  useEffect(() => {
    if (!token || typeof window === "undefined") return;
    const route = parseSessionHash(window.location.hash);
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw) {
      window.location.hash = "session";
      setView("session");
      return;
    }
    setView(route);
  }, [token]);

  function goRoute(route: SessionRoute) {
    setView(route);
    if (typeof window !== "undefined") {
      window.location.hash = hashForRoute(route).slice(1);
    }
  }

  function goTracking() {
    goRoute("tracking");
  }

  function goTerminal() {
    goRoute("terminal");
  }

  function goScanner() {
    goRoute("scanner");
  }

  function goSession() {
    goRoute("session");
  }

  function goSessionTrace() {
    goRoute("session-trace");
  }

  function persistVulnStore(next: VulnTrackingStore) {
    saveVulnTrackingStore(next);
    setVulnStore(next);
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
   * One CTA: liability checkbox → mission → owner-auth → execute (local auto Circuit A).
   */
  async function runScanner() {
    if (!readiness.ready) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const validated = validateRealMissionInput({
        targetHost: realTargetHost,
        testResponsibilityAccepted,
      });
      if (!validated.ok) {
        setError(validated.reason);
        appendScanOutcome(
          refusedScanJournalArgs(realTargetHost, validated.reason),
          undefined,
          traceBridge,
        );
        return;
      }

      appendScanStarted(validated.targetHost, undefined, traceBridge);

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
        appendScanOutcome({
          host: validated.targetHost,
          missionId: "none",
          ok: false,
          detail:
            typeof mission?.message === "string"
              ? mission.message
              : "Création mission échouée",
        }, undefined, traceBridge);
        return;
      }

      const authorized = await fetch(
        `${API}/v1/missions/${mission.id}/owner-authorization`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            signerLabel: email,
            testResponsibilityAccepted: true,
            testResponsibilityLabel: TEST_RESPONSIBILITY_LABEL,
          }),
        },
      ).then((r) => r.json());
      if (!authorized?.id && authorized?.message) {
        setError(
          typeof authorized.message === "string"
            ? authorized.message
            : JSON.stringify(authorized.message),
        );
        appendScanOutcome({
          host: validated.targetHost,
          missionId: String(mission.id),
          ok: false,
          detail:
            typeof authorized.message === "string"
              ? authorized.message
              : "Autorisation propriétaire échouée",
        }, undefined, traceBridge);
        await refresh();
        return;
      }

      const missionId = String(authorized?.id ?? mission.id);
      const status = String(authorized?.status ?? mission.status ?? "?");
      if (canClientExecute(status)) {
        setInfo("Scan…");
        const run = await fetch(`${API}/v1/missions/${missionId}/execute`, {
          method: "POST",
          headers,
        }).then((r) => r.json());
        if (run.gate?.decision === "REJECT") {
          setError(`${run.gate.code}: ${run.gate.reason}`);
          appendScanOutcome({
            host: validated.targetHost,
            missionId,
            ok: false,
            detail: `${run.gate.code}: ${run.gate.reason}`,
            gateCode: String(run.gate.code ?? ""),
          }, undefined, traceBridge);
        } else if (run.message && !run.id && !run.gate) {
          setError(
            typeof run.message === "string"
              ? run.message
              : JSON.stringify(run.message),
          );
          appendScanOutcome({
            host: validated.targetHost,
            missionId,
            ok: false,
            detail:
              typeof run.message === "string"
                ? run.message
                : JSON.stringify(run.message),
          }, undefined, traceBridge);
        } else {
          setInfo("OK");
          appendScanOutcome({
            host: validated.targetHost,
            missionId,
            ok: true,
            detail: String(run.status ?? run.gate?.decision ?? "EXECUTED"),
          }, undefined, traceBridge);
        }
      } else {
        setInfo(circuitAPendingMessage(missionId, status));
        appendScanOutcome({
          host: validated.targetHost,
          missionId,
          ok: false,
          detail: circuitAPendingMessage(missionId, status),
        }, undefined, traceBridge);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      appendScanOutcome({
        host: realTargetHost,
        missionId: "error",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      }, undefined, traceBridge);
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
      appendScanStarted(realTargetHost, undefined, traceBridge);
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
        appendScanOutcome({
          host: realTargetHost,
          missionId,
          ok: false,
          detail:
            typeof run.message === "string"
              ? run.message
              : JSON.stringify(run.message),
        }, undefined, traceBridge);
      } else if (run.gate?.decision === "REJECT") {
        setError(`${run.gate.code}: ${run.gate.reason}`);
        appendScanOutcome({
          host: realTargetHost,
          missionId,
          ok: false,
          detail: `${run.gate.code}: ${run.gate.reason}`,
          gateCode: String(run.gate.code ?? ""),
        }, undefined, traceBridge);
      } else {
        setInfo(`Exécution lancée pour ${missionId}.`);
        appendScanOutcome({
          host: realTargetHost,
          missionId,
          ok: true,
          detail: String(run.status ?? "EXECUTED"),
        }, undefined, traceBridge);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      appendScanOutcome({
        host: realTargetHost,
        missionId,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      }, undefined, traceBridge);
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

  void missionMode;
  void catalog;

  const recentResults = unified.filter((r) => !r.synthetic).slice(0, 12);

  /** Dernier bilan réel → tableau risque / compromission (un écran). */
  const latestRiskMeta: {
    table: RiskTableRow[];
    missionId: string | null;
    reportId: string | null;
  } = (() => {
    const reports = missions
      .filter((m) => !m.synthetic)
      .flatMap((m) =>
        (m.reports ?? []).map((r) => ({
          ...r,
          missionId: m.id,
          missionSynthetic: m.synthetic,
        })),
      )
      .filter((r) => !r.synthetic)
      .sort((a, b) =>
        String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
      );
    for (const r of reports) {
      const table = riskTableFromReportExport(r.exportJson);
      if (table.length) {
        return {
          table,
          missionId: r.missionId,
          reportId: r.id,
        };
      }
    }
    return { table: [], missionId: null, reportId: null };
  })();
  const latestRiskTable = latestRiskMeta.table;

  const ingestSignature = latestRiskMeta.reportId
    ? `${latestRiskMeta.reportId}:${latestRiskTable
        .map((r) => `${r.control}|${r.url}|${r.riskCode}`)
        .join(";")}`
    : "";

  /** Ingest cross-scan une fois par rapport (dédup via store.ingestedReportIds). */
  useEffect(() => {
    if (!token || !latestRiskMeta.reportId || latestRiskTable.length === 0) {
      return;
    }
    const current = loadVulnTrackingStore();
    if (current.ingestedReportIds?.includes(latestRiskMeta.reportId)) return;
    const next = ingestRiskTableIntoTracking(current, latestRiskTable, {
      missionId: latestRiskMeta.missionId,
      reportId: latestRiskMeta.reportId,
    });
    if (next !== current) persistVulnStore(next);
  }, [
    token,
    ingestSignature,
    latestRiskMeta.missionId,
    latestRiskMeta.reportId,
    latestRiskTable,
  ]);

  /** Live journal — rapport prêt (dédup id report-*). */
  useEffect(() => {
    if (!token || !latestRiskMeta.reportId || !latestRiskMeta.missionId) return;
    appendReportAvailable({
      missionId: latestRiskMeta.missionId,
      reportId: latestRiskMeta.reportId,
      host: realTargetHost.trim() || undefined,
    }, undefined, traceBridge);
  }, [token, latestRiskMeta.missionId, latestRiskMeta.reportId, realTargetHost]);

  return (
    <div className="shell">
      <div className="brand-lockup">
        <span className="hero-orb" aria-hidden="true" />
        <p className="brand">Atlas</p>
      </div>

      {!token ? (
        <section id="session" aria-label="Connexion">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="cta-scanner" onClick={() => void login()}>
            Entrer
          </button>
          <p className="muted">owner@demo.atlas.local / atlas-demo</p>
        </section>
      ) : view === "session-trace" ? (
        <SessionTracePage
          apiBase={API}
          token={token}
          onBack={goSession}
        />
      ) : view === "session" ? (
        <section id="session" className="gabriel-session" aria-label="Session Gabriel">
          <p className="session-chip muted">Session Gabriel · stagiaire</p>
          <button
            type="button"
            className="cta-scanner"
            onClick={goSessionTrace}
          >
            Journal d&apos;activité
          </button>
          <p className="session-secondary">
            <button type="button" className="ghost" onClick={goScanner}>
              Scanner
            </button>
            <button type="button" className="ghost" onClick={goTerminal}>
              Session locale
            </button>
            <button type="button" className="ghost" onClick={goTracking}>
              Suivi &amp; archive
            </button>
          </p>
        </section>
      ) : view === "tracking" ? (
        <VulnTrackingView
          store={vulnStore}
          onStoreChange={persistVulnStore}
          onBack={goScanner}
        />
      ) : view === "terminal" ? (
        <SessionTerminalView onBack={goSession} onLaunchScan={goScanner} />
      ) : (
        <section id="scanner" className="scanner-hero" aria-label="Scanner">
          <label
            className="mode-toggle responsibility-gate"
            htmlFor="test-responsibility"
          >
            <input
              id="test-responsibility"
              type="checkbox"
              checked={testResponsibilityAccepted}
              onChange={(e) => setTestResponsibilityAccepted(e.target.checked)}
            />{" "}
            {TEST_RESPONSIBILITY_LABEL}
          </label>
          {authorizedLaunch && (
            <p className="muted" role="status" data-testid="authorized-launch-banner">
              {formatAuthorizedLaunchBanner(authorizedLaunch)}
            </p>
          )}
          <label htmlFor="real-target">URL / FQDN</label>
          <input
            id="real-target"
            value={realTargetHost}
            onChange={(e) => setRealTargetHost(e.target.value)}
            placeholder={DEFAULT_REAL_TARGET}
            autoComplete="off"
            disabled={!testResponsibilityAccepted}
          />
          <button
            type="button"
            className="cta-scanner"
            disabled={busy || !readiness.ready || !testResponsibilityAccepted}
            onClick={() => void runScanner()}
          >
            {busy ? "…" : "Scan"}
          </button>
          {readiness.blockReason && (
            <p className="block-reason" role="status">
              {readiness.blockReason}
            </p>
          )}
          {info && <p className="muted">{info}</p>}
          {error && <p style={{ color: "var(--alert)" }}>{error}</p>}

          <p className="tracking-nav-inline">
            <button type="button" className="ghost" onClick={goSession}>
              Session Gabriel
            </button>
            <button type="button" className="ghost" onClick={goTracking}>
              Suivi &amp; archive
            </button>
            <button type="button" className="ghost" onClick={goTerminal}>
              Session locale
            </button>
            <span className="muted export-hint">
              Hors hero — suivi vulns · terminal soft local (:17865)
            </span>
          </p>

          <h2 id="results-title">Resultats</h2>
          {latestRiskTable.length > 0 ? (
            <div className="risk-table-wrap">
              <table className="risk-table" aria-label="Niveaux de risque et compromission">
                <thead>
                  <tr>
                    <th scope="col">URL</th>
                    <th scope="col">Contrôle</th>
                    <th scope="col">Risque</th>
                    <th scope="col">Compromission / exposition</th>
                  </tr>
                </thead>
                <tbody>
                  {latestRiskTable.map((r, i) => (
                    <tr
                      key={`${r.control}-${r.url || r.host}-${i}`}
                      data-risk={r.riskCode}
                    >
                      <td className="risk-url">
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer">
                            {r.url}
                          </a>
                        ) : (
                          <span className="muted">{r.host || "—"}</span>
                        )}
                      </td>
                      <td>
                        <strong>{r.control}</strong>
                      </td>
                      <td>
                        <span className={`risk-badge risk-${r.riskCode}`}>
                          {r.risk}
                        </span>
                      </td>
                      <td>{r.compromise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : recentResults.length === 0 ? (
            <p className="muted">Aucun resultat.</p>
          ) : null}
          {recentResults.length > 0 && (
            <ul className="results-list results-compact">
              {recentResults
                .filter((r) => r.kind === "report")
                .slice(0, 3)
                .map((row) => (
                  <li key={row.id} className="result-row">
                    <strong>{row.title}</strong>
                    <div className="muted">{row.detail}</div>
                    {row.missionId && row.reportId && (
                      <div className="export-actions">
                        {REPORT_EXPORT_FORMATS.map((format) => (
                          <button
                            key={format}
                            type="button"
                            className="ghost export-btn"
                            disabled={
                              busy || exportBusyKey === `${row.reportId}:${format}`
                            }
                            onClick={() =>
                              void downloadReportExport(
                                row.missionId!,
                                row.reportId!,
                                format,
                              )
                            }
                          >
                            {format.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {!token && error && (
        <p style={{ color: "var(--alert)" }}>{error}</p>
      )}
    </div>
  );
}
