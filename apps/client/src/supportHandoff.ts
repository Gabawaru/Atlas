/**
 * Prise en charge Pragma — seul moment d'egress des vulns client.
 *
 * Règles Ben :
 * - Par défaut tout est local (localStorage) : rien ne quitte la machine.
 * - Compte en ligne = clients support uniquement.
 * - Scan local gratuit ; support = abonnement facturé par Pragma
 *   (pas de metering par domaine pour le local).
 */

import {
  formatHeavyTimestamp,
  statutLabelFr,
  type VulnTrackEntry,
} from "./vulnTracking";
import { formatLocalBridgeNetworkFailure } from "./localShell";

export const SUPPORT_HANDOFF_LOG_KEY = "atlas.support-handoff.log.v1";

export type SupportHandoffResult =
  | {
      ok: true;
      ticketId: string;
      notice: string;
      fingerprints: string[];
    }
  | {
      ok: false;
      code:
        | "no_selection"
        | "local_only"
        | "auth_required"
        | "http_error"
        | "network";
      message: string;
    };

export type SupportHandoffLogEntry = {
  id: string;
  at: string;
  fingerprints: string[];
  shortIds: string[];
  ticketId?: string;
  egress: "sent" | "refused" | "error";
  detail: string;
};

/** Construit le rapport choisi (Markdown) — payload unique d'egress. */
export function buildSupportHandoffReport(entries: VulnTrackEntry[]): string {
  const at = new Date().toISOString();
  const lines: string[] = [
    "# Demande de prise en charge Atlas → Pragma",
    "",
    `Généré localement le ${formatHeavyTimestamp(at)}.`,
    "",
    "Scan local gratuit — cette demande est le **seul egress** des findings client.",
    "Support = abonnement Pragma (pas de metering par domaine pour le local).",
    "",
    `Entrées : **${entries.length}**`,
    "",
    "| ID | Statut | Détection | Correction | Contrôle | Hôte |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const e of entries) {
    lines.push(
      `| ${e.shortId} | ${statutLabelFr(e.status)} | ${e.firstSeenAt} | ${e.resolvedAt ?? "—"} | ${escapeCell(e.control)} | ${escapeCell(e.host || e.url)} |`,
    );
  }
  lines.push("", "## Détail", "");
  for (const e of entries) {
    lines.push(
      `### ${e.shortId} — ${e.control}`,
      "",
      `- Statut : **${statutLabelFr(e.status)}**`,
      `- Date détection : ${formatHeavyTimestamp(e.firstSeenAt)}`,
      `- Date correction : ${formatHeavyTimestamp(e.resolvedAt)}`,
      `- Risque : ${e.risk} (\`${e.riskCode}\`)`,
      `- URL : ${e.url || "—"}`,
      `- Signal : ${e.signal || "—"}`,
      `- Exposition : ${e.compromise || "—"}`,
      "",
    );
  }
  return lines.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Envoie le rapport choisi à Pragma via Atlas API (abonnement support requis côté serveur).
 * Sans jeton / hors support → refus local, aucune donnée transmise.
 */
export async function requestPragmaSupportHandoff(args: {
  entries: VulnTrackEntry[];
  apiBase: string;
  token: string | null;
  /** false = mode local-first strict (défaut produit) */
  supportCustomer?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<SupportHandoffResult> {
  if (args.entries.length === 0) {
    return {
      ok: false,
      code: "no_selection",
      message: "Sélectionnez au moins une entrée de l’historique.",
    };
  }

  const supportCustomer = args.supportCustomer ?? Boolean(args.token);
  if (!supportCustomer) {
    const message =
      "Mode local : les vulnérabilités restent sur cette machine. Un compte support Pragma (abonnement) est requis pour demander une prise en charge.";
    appendHandoffLog({
      fingerprints: args.entries.map((e) => e.fingerprint),
      shortIds: args.entries.map((e) => e.shortId),
      egress: "refused",
      detail: message,
    });
    return { ok: false, code: "local_only", message };
  }

  if (!args.token) {
    return {
      ok: false,
      code: "auth_required",
      message:
        "Compte support en ligne requis — connectez-vous pour envoyer le rapport à Pragma.",
    };
  }

  const reportMarkdown = buildSupportHandoffReport(args.entries);
  const fingerprints = args.entries.map((e) => e.fingerprint);
  const shortIds = args.entries.map((e) => e.shortId);
  const fetchImpl = args.fetchImpl ?? fetch;

  try {
    const res = await fetchImpl(
      `${args.apiBase.replace(/\/$/, "")}/v1/support/handoff`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportMarkdown,
          fingerprints,
          shortIds,
          subject: `Prise en charge Atlas (${shortIds.slice(0, 3).join(", ")}${shortIds.length > 3 ? "…" : ""})`,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      let message = body || `HTTP ${res.status}`;
      try {
        const json = JSON.parse(body) as { message?: string | string[] };
        if (typeof json.message === "string") message = json.message;
        else if (Array.isArray(json.message)) message = json.message.join("; ");
      } catch {
        /* keep text */
      }
      appendHandoffLog({
        fingerprints,
        shortIds,
        egress: "error",
        detail: message,
      });
      return { ok: false, code: "http_error", message };
    }
    const data = (await res.json()) as {
      ticketId?: string;
      id?: string;
      notice?: string;
    };
    const ticketId = data.ticketId ?? data.id ?? "unknown";
    const notice =
      data.notice ??
      "Rapport transmis à Pragma. Scan local reste gratuit ; support facturé par abonnement.";
    appendHandoffLog({
      fingerprints,
      shortIds,
      ticketId,
      egress: "sent",
      detail: notice,
    });
    return { ok: true, ticketId, notice, fingerprints };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const message = formatLocalBridgeNetworkFailure(raw, "api-health");
    appendHandoffLog({
      fingerprints,
      shortIds,
      egress: "error",
      detail: message,
    });
    return { ok: false, code: "network", message };
  }
}

function appendHandoffLog(partial: {
  fingerprints: string[];
  shortIds: string[];
  ticketId?: string;
  egress: SupportHandoffLogEntry["egress"];
  detail: string;
}): void {
  if (typeof localStorage === "undefined") return;
  const entry: SupportHandoffLogEntry = {
    id: `handoff-${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    ...partial,
  };
  try {
    const raw = localStorage.getItem(SUPPORT_HANDOFF_LOG_KEY);
    const prev = raw ? (JSON.parse(raw) as SupportHandoffLogEntry[]) : [];
    const next = [...(Array.isArray(prev) ? prev : []), entry].slice(-40);
    localStorage.setItem(SUPPORT_HANDOFF_LOG_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}
