/**
 * Vue Suivi / Archive — hors écran Scanner principal.
 * Trois tables rotatives : non résolues · résolues · archive (recherche + filtres).
 *
 * FUTURE: propositions de correctifs IA — non implémentées (voir proposeAiFixStub).
 */

import { useEffect, useMemo, useState } from "react";
import type { RiskCode } from "./riskTable";
import {
  buildVulnArchivePdfMd,
  downloadVulnArchivePdfMd,
} from "./vulnArchive";
import {
  filterArchiveEntries,
  formatHeavyTimestamp,
  formatOpenRange,
  listResolved,
  listUnresolved,
  markVulnResolved,
  proposeAiFixStub,
  type VulnTrackEntry,
  type VulnTrackingStore,
} from "./vulnTracking";

const PAGE_SIZE = 4;

type Props = {
  store: VulnTrackingStore;
  onStoreChange: (next: VulnTrackingStore) => void;
  onBack: () => void;
};

type PanelKind = "unresolved" | "resolved" | "archive";

export function VulnTrackingView({ store, onStoreChange, onBack }: Props) {
  const unresolved = useMemo(() => listUnresolved(store), [store]);
  const resolved = useMemo(() => listResolved(store), [store]);

  const [panel, setPanel] = useState<PanelKind>("unresolved");
  const [page, setPage] = useState(0);

  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveDateFrom, setArchiveDateFrom] = useState("");
  const [archiveDateTo, setArchiveDateTo] = useState("");
  const [archiveRisk, setArchiveRisk] = useState<RiskCode | "all">("all");
  const [archiveAlpha, setArchiveAlpha] = useState(false);

  const archiveRows = useMemo(
    () =>
      filterArchiveEntries(store, {
        query: archiveQuery,
        dateFrom: archiveDateFrom,
        dateTo: archiveDateTo,
        riskCode: archiveRisk,
        alphabetical: archiveAlpha,
      }),
    [
      store,
      archiveQuery,
      archiveDateFrom,
      archiveDateTo,
      archiveRisk,
      archiveAlpha,
    ],
  );

  const activeRows =
    panel === "unresolved"
      ? unresolved
      : panel === "resolved"
        ? resolved
        : archiveRows;

  const pageCount = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = activeRows.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    setPage(0);
  }, [
    panel,
    archiveQuery,
    archiveDateFrom,
    archiveDateTo,
    archiveRisk,
    archiveAlpha,
  ]);

  const [resolveFp, setResolveFp] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [fixAnalysis, setFixAnalysis] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function openResolve(entry: VulnTrackEntry) {
    setResolveFp(entry.fingerprint);
    setResolutionNotes("");
    setFixAnalysis("");
    setFormError(null);
    // FUTURE: AI fix propositions — stub only
    void proposeAiFixStub(entry);
  }

  function submitResolve() {
    if (!resolveFp) return;
    try {
      const next = markVulnResolved(store, resolveFp, {
        resolutionNotes,
        fixAnalysis,
      });
      onStoreChange(next);
      setResolveFp(null);
      setFormError(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  function exportArchive() {
    const doc = buildVulnArchivePdfMd(store);
    downloadVulnArchivePdfMd(doc);
  }

  return (
    <section className="tracking-view" aria-label="Suivi vulnérabilités">
      <header className="tracking-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Scanner
        </button>
        <div className="tracking-header-text">
          <h2>Suivi &amp; archive</h2>
          <p className="muted tracking-lede">
            Tables horodatées hors écran principal — identité cross-scan (ID
            CCV) et archive des correctifs.
          </p>
        </div>
        <button
          type="button"
          className="ghost export-btn"
          onClick={exportArchive}
        >
          Export PDF.md
        </button>
      </header>

      <nav className="tracking-tabs" aria-label="Tables de suivi">
        <button
          type="button"
          className={panel === "unresolved" ? "tab active" : "tab"}
          onClick={() => setPanel("unresolved")}
        >
          Non résolues
          <span className="tab-count">{unresolved.length}</span>
        </button>
        <button
          type="button"
          className={panel === "resolved" ? "tab active" : "tab"}
          onClick={() => setPanel("resolved")}
        >
          Résolues
          <span className="tab-count">{resolved.length}</span>
        </button>
        <button
          type="button"
          className={panel === "archive" ? "tab active" : "tab"}
          onClick={() => setPanel("archive")}
        >
          Archive
          <span className="tab-count">{archiveRows.length}</span>
        </button>
      </nav>

      {panel === "archive" && (
        <div className="archive-toolbar" role="search">
          <label className="archive-search-label" htmlFor="archive-q">
            Recherche
          </label>
          <input
            id="archive-q"
            type="search"
            placeholder="Date, nom, ID CCV…"
            value={archiveQuery}
            onChange={(e) => setArchiveQuery(e.target.value)}
          />
          <div className="archive-filters">
            <label>
              Du
              <input
                type="date"
                value={archiveDateFrom}
                onChange={(e) => setArchiveDateFrom(e.target.value)}
              />
            </label>
            <label>
              Au
              <input
                type="date"
                value={archiveDateTo}
                onChange={(e) => setArchiveDateTo(e.target.value)}
              />
            </label>
            <label>
              Type
              <select
                value={archiveRisk}
                onChange={(e) =>
                  setArchiveRisk(e.target.value as RiskCode | "all")
                }
              >
                <option value="all">Tous</option>
                <option value="critical">critique</option>
                <option value="high">élevé</option>
                <option value="medium">moyen</option>
                <option value="low">faible</option>
              </select>
            </label>
            <label className="mode-toggle archive-alpha">
              <input
                type="checkbox"
                checked={archiveAlpha}
                onChange={(e) => setArchiveAlpha(e.target.checked)}
              />{" "}
              Tri A→Z
            </label>
          </div>
        </div>
      )}

      <div className="tracking-panel">
        <div className="tracking-scroll" tabIndex={0}>
          {slice.length === 0 ? (
            <p className="muted tracking-empty">
              {panel === "unresolved"
                ? "Aucune vulnérabilité ouverte."
                : panel === "resolved"
                  ? "Aucune entrée résolue."
                  : "Aucun résultat dans l’archive (ajustez la recherche)."}
            </p>
          ) : (
            <ul className="tracking-cards">
              {slice.map((entry) => (
                <li key={entry.fingerprint} className="tracking-card">
                  <div className="tracking-card-top">
                    <code className="ccv-id" title={entry.fingerprint}>
                      {entry.shortId}
                    </code>
                    <span className={`risk-badge risk-${entry.riskCode}`}>
                      {entry.risk}
                    </span>
                  </div>
                  <h3 className="tracking-control">{entry.control}</h3>
                  <p className="tracking-url">
                    {entry.url ? (
                      <a href={entry.url} target="_blank" rel="noreferrer">
                        {entry.url}
                      </a>
                    ) : (
                      <span className="muted">{entry.host || "—"}</span>
                    )}
                  </p>
                  <p className="tracking-range" aria-label="Plage de dates">
                    <span className="range-label">De → à</span>
                    <strong>{formatOpenRange(entry)}</strong>
                  </p>
                  <dl className="tracking-meta">
                    <div>
                      <dt>Premier constat</dt>
                      <dd>{formatHeavyTimestamp(entry.firstSeenAt)}</dd>
                    </div>
                    <div>
                      <dt>
                        {entry.status === "resolved"
                          ? "Résolu le"
                          : "Dernier constat"}
                      </dt>
                      <dd>
                        {formatHeavyTimestamp(
                          entry.status === "resolved"
                            ? entry.resolvedAt
                            : entry.lastSeenAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Scans</dt>
                      <dd>{entry.seenCount}</dd>
                    </div>
                  </dl>
                  {entry.status === "resolved" && (
                    <div className="tracking-fix-preview">
                      <p>
                        <span className="meta-k">Fait</span>{" "}
                        {entry.resolutionNotes || "—"}
                      </p>
                      <p>
                        <span className="meta-k">Analyse</span>{" "}
                        {entry.fixAnalysis || "—"}
                      </p>
                    </div>
                  )}
                  {entry.status === "unresolved" && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => openResolve(entry)}
                    >
                      Marquer résolu…
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tracking-rotate" aria-label="Rotation des entrées">
          <button
            type="button"
            className="ghost"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Préc.
          </button>
          <span className="muted">
            {activeRows.length === 0
              ? "0"
              : `${safePage + 1} / ${pageCount}`}{" "}
            · {activeRows.length} entrée
            {activeRows.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="ghost"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Suiv. →
          </button>
        </div>
      </div>

      {resolveFp && (
        <div className="resolve-modal" role="dialog" aria-modal="true">
          <div className="resolve-sheet">
            <h3>Clôturer l’entrée</h3>
            <p className="muted">
              Notes + analyse du correctif final (archive PDF.md). Pas de
              proposition IA pour l’instant.
            </p>
            <label htmlFor="res-notes">Ce qui a été fait</label>
            <textarea
              id="res-notes"
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Ex. Header HSTS ajouté sur le reverse-proxy…"
            />
            <label htmlFor="res-analysis">Analyse du correctif final</label>
            <textarea
              id="res-analysis"
              rows={4}
              value={fixAnalysis}
              onChange={(e) => setFixAnalysis(e.target.value)}
              placeholder="Pourquoi ce correctif ferme le risque, preuves de retest…"
            />
            {formError && (
              <p style={{ color: "var(--alert)" }} role="alert">
                {formError}
              </p>
            )}
            <div className="resolve-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setResolveFp(null)}
              >
                Annuler
              </button>
              <button type="button" onClick={submitResolve}>
                Enregistrer résolution
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
