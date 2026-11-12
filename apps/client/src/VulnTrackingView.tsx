/**
 * Historique — une table (Statut / détection / correction) + filtres + recherche.
 * Local-first : rien ne quitte la machine sauf « Demander une prise en charge ».
 *
 * FUTURE: propositions de correctifs IA — non implémentées (voir proposeAiFixStub).
 */

import { useEffect, useMemo, useState } from "react";
import type { RiskCode } from "./riskTable";
import {
  buildVulnArchivePdfMd,
  downloadVulnArchivePdfMd,
} from "./vulnArchive";
import { requestPragmaSupportHandoff } from "./supportHandoff";
import { gateSupportHandoffC1 } from "./supportHandoffConfirm";
import {
  filterHistoryEntries,
  formatHeavyTimestamp,
  markSupportHandoffRequested,
  markVulnResolved,
  proposeAiFixStub,
  statutLabelFr,
  type HistoryStatusFilter,
  type VulnTrackEntry,
  type VulnTrackingStore,
} from "./vulnTracking";

const PAGE_SIZE = 8;

type Props = {
  store: VulnTrackingStore;
  onStoreChange: (next: VulnTrackingStore) => void;
  onBack: () => void;
  apiBase: string;
  token: string | null;
};

export function VulnTrackingView({
  store,
  onStoreChange,
  onBack,
  apiBase,
  token,
}: Props) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [risk, setRisk] = useState<RiskCode | "all">("all");
  const [status, setStatus] = useState<HistoryStatusFilter>("all");
  const [alpha, setAlpha] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffMsg, setHandoffMsg] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      filterHistoryEntries(store, {
        query,
        dateFrom,
        dateTo,
        riskCode: risk,
        status,
        alphabetical: alpha,
      }),
    [store, query, dateFrom, dateTo, risk, status, alpha],
  );

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = rows.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  useEffect(() => {
    setPage(0);
  }, [query, dateFrom, dateTo, risk, status, alpha]);

  const [resolveFp, setResolveFp] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [fixAnalysis, setFixAnalysis] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function openResolve(entry: VulnTrackEntry) {
    setResolveFp(entry.fingerprint);
    setResolutionNotes("");
    setFixAnalysis("");
    setFormError(null);
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

  function toggleSelect(fp: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fp)) next.delete(fp);
      else next.add(fp);
      return next;
    });
  }

  function toggleSelectVisible() {
    const fps = slice.map((e) => e.fingerprint);
    const allOn = fps.every((fp) => selected.has(fp));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const fp of fps) {
        if (allOn) next.delete(fp);
        else next.add(fp);
      }
      return next;
    });
  }

  async function askSupportHandoff() {
    setHandoffMsg(null);
    const chosen = store.entries.filter((e) => selected.has(e.fingerprint));
    /* C1 before any egress — phone blocked until ATLAS_API_BASE phone→PC ships */
    const gate = gateSupportHandoffC1();
    if (!gate.ok) {
      setHandoffMsg(gate.message);
      return;
    }
    setHandoffBusy(true);
    try {
      const result = await requestPragmaSupportHandoff({
        entries: chosen,
        apiBase,
        token,
        // Compte en ligne = clients support ; sans jeton = local strict.
        supportCustomer: Boolean(token),
        pcConfirmedAt: gate.pcConfirmedAt,
      });
      if (result.ok) {
        onStoreChange(
          markSupportHandoffRequested(store, result.fingerprints),
        );
        setSelected(new Set());
        setHandoffMsg(result.notice);
      } else {
        setHandoffMsg(result.message);
      }
    } finally {
      setHandoffBusy(false);
    }
  }

  return (
    <section className="tracking-view" aria-label="Historique vulnérabilités">
      <header className="tracking-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Scanner
        </button>
        <div className="tracking-header-text">
          <h2>Historique</h2>
          <p className="muted tracking-lede">
            Une table locale — Statut, date détection, date correction. Les
            findings ne quittent pas cette machine ; scan local gratuit.
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

      <p className="tracking-local-banner" role="note">
        Local-first : pas d’envoi automatique. Seul le bouton{" "}
        <strong>Demander une prise en charge</strong> transmet le rapport choisi
        à Pragma (abonnement support — pas de metering par domaine).
      </p>

      <div className="archive-toolbar history-toolbar" role="search">
        <label className="archive-search-label" htmlFor="history-q">
          Recherche
        </label>
        <input
          id="history-q"
          type="search"
          placeholder="ID CCV, nom, hôte, statut…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="archive-filters">
          <label>
            Statut
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as HistoryStatusFilter)
              }
            >
              <option value="all">Tous</option>
              <option value="a_corriger">À corriger</option>
              <option value="corrige">Corrigé</option>
            </select>
          </label>
          <label>
            Du
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label>
            Au
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label>
            Type
            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value as RiskCode | "all")}
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
              checked={alpha}
              onChange={(e) => setAlpha(e.target.checked)}
            />{" "}
            Tri A→Z
          </label>
        </div>
      </div>

      <div className="history-actions">
        <button
          type="button"
          className="primary-ish"
          disabled={handoffBusy || selected.size === 0}
          onClick={() => void askSupportHandoff()}
        >
          {handoffBusy
            ? "Envoi…"
            : `Demander une prise en charge${selected.size ? ` (${selected.size})` : ""}`}
        </button>
        <span className="muted">
          {selected.size === 0
            ? "Cochez les lignes du rapport à transmettre."
            : `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}`}
        </span>
      </div>
      {handoffMsg && (
        <p className="handoff-msg" role="status">
          {handoffMsg}
        </p>
      )}

      <div className="tracking-panel">
        <div className="tracking-scroll history-scroll" tabIndex={0}>
          {slice.length === 0 ? (
            <p className="muted tracking-empty">
              Aucune entrée (ajustez recherche / filtres).
            </p>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th scope="col">
                    <input
                      type="checkbox"
                      aria-label="Sélectionner la page"
                      checked={
                        slice.length > 0 &&
                        slice.every((e) => selected.has(e.fingerprint))
                      }
                      onChange={toggleSelectVisible}
                    />
                  </th>
                  <th scope="col">Statut</th>
                  <th scope="col">Date détection</th>
                  <th scope="col">Date correction</th>
                  <th scope="col">ID</th>
                  <th scope="col">Contrôle</th>
                  <th scope="col">Risque</th>
                  <th scope="col">Cible</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((entry) => (
                  <tr key={entry.fingerprint}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${entry.shortId}`}
                        checked={selected.has(entry.fingerprint)}
                        onChange={() => toggleSelect(entry.fingerprint)}
                      />
                    </td>
                    <td>
                      <span
                        className={
                          entry.status === "resolved"
                            ? "statut-badge statut-corrige"
                            : "statut-badge statut-a-corriger"
                        }
                      >
                        {statutLabelFr(entry.status)}
                      </span>
                      {entry.supportHandoffAt && (
                        <div className="handoff-stamp muted">
                          Prise en charge{" "}
                          {formatHeavyTimestamp(entry.supportHandoffAt)}
                        </div>
                      )}
                    </td>
                    <td>{formatHeavyTimestamp(entry.firstSeenAt)}</td>
                    <td>
                      {entry.status === "resolved"
                        ? formatHeavyTimestamp(entry.resolvedAt)
                        : "—"}
                    </td>
                    <td>
                      <code className="ccv-id" title={entry.fingerprint}>
                        {entry.shortId}
                      </code>
                    </td>
                    <td>
                      <strong className="history-control">{entry.control}</strong>
                    </td>
                    <td>
                      <span className={`risk-badge risk-${entry.riskCode}`}>
                        {entry.risk}
                      </span>
                    </td>
                    <td className="history-target">
                      {entry.url ? (
                        <a href={entry.url} target="_blank" rel="noreferrer">
                          {entry.url}
                        </a>
                      ) : (
                        <span className="muted">{entry.host || "—"}</span>
                      )}
                    </td>
                    <td>
                      {entry.status === "unresolved" ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => openResolve(entry)}
                        >
                          Marquer corrigé…
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="tracking-rotate" aria-label="Pagination historique">
          <button
            type="button"
            className="ghost"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Préc.
          </button>
          <span className="muted">
            {rows.length === 0
              ? "0"
              : `${safePage + 1} / ${pageCount}`}{" "}
            · {rows.length} entrée{rows.length === 1 ? "" : "s"}
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
            <h3>Marquer corrigé</h3>
            <p className="muted">
              Notes + analyse du correctif final (archive PDF.md). Pas de
              proposition IA pour l’instant. Reste local jusqu’à une prise en
              charge.
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
                Enregistrer (Corrigé)
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
