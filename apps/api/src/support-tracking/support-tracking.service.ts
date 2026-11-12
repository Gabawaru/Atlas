import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import {
  newSupportSessionId,
  readSupportSession,
  writeSupportSession,
} from "./support-tracking.store";
import {
  toSnapshot,
  type SupportProgressRow,
  type SupportSessionRecord,
  type SupportSessionSnapshot,
  type SupportTicketRow,
  type SupportVulnRow,
} from "./support-tracking.types";

function shortId(prefix: string): string {
  return `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeTicket(t: Partial<SupportTicketRow> & { id?: string }): SupportTicketRow {
  return {
    id: String(t.id || shortId("TKT")),
    subject: String(t.subject || "Prise en charge Pragma").slice(0, 200),
    status: String(t.status || "ouvert").slice(0, 40),
    updatedAt: String(t.updatedAt || nowIso()),
  };
}

function sanitizeVuln(
  v: Partial<SupportVulnRow> & { title?: string },
  ticketId: string,
): SupportVulnRow {
  const row: SupportVulnRow = {
    id: String(v.id || shortId("CCV")),
    title: String(v.title || "Finding").slice(0, 300),
    risk: String(v.risk || "info").slice(0, 40),
    ticketId: String(v.ticketId || ticketId),
    status: String(v.status || "en revue").slice(0, 40),
  };
  if (v.fingerprint) row.fingerprint = String(v.fingerprint).slice(0, 200);
  return row;
}

function sanitizeProgress(
  p: Partial<SupportProgressRow>,
  ticketId: string,
): SupportProgressRow {
  return {
    ticketId: String(p.ticketId || ticketId),
    label: String(p.label || "Prise en charge").slice(0, 200),
    pct: typeof p.pct === "number" ? Math.max(0, Math.min(100, p.pct)) : 0,
    note: String(p.note || "").slice(0, 400),
    updatedAt: String(p.updatedAt || nowIso()),
  };
}

@Injectable()
export class SupportTrackingService {
  /** Soft twin / pages handoff — opaque id, no PII persisted. */
  async createSoftHandoff(input: {
    source?: string;
    ticket?: Partial<SupportTicketRow>;
    vulns?: Array<Partial<SupportVulnRow>>;
  }): Promise<SupportSessionSnapshot> {
    const at = nowIso();
    const supportSessionId = newSupportSessionId();
    const ticket = sanitizeTicket({
      ...input.ticket,
      subject: input.ticket?.subject || "Prise en charge Pragma",
      status: input.ticket?.status || "ouvert",
      updatedAt: at,
    });
    const seedVulns =
      input.vulns && input.vulns.length
        ? input.vulns.map((v) => sanitizeVuln(v, ticket.id))
        : [
            sanitizeVuln(
              {
                title: "Vulnérabilité signalée",
                risk: "moyen",
                status: "en revue",
              },
              ticket.id,
            ),
          ];
    const progress: SupportProgressRow[] = [
      sanitizeProgress(
        {
          label: "Prise en charge reçue",
          pct: 15,
          note: "File d’attente support (session opaque)",
          updatedAt: at,
        },
        ticket.id,
      ),
    ];
    const rec: SupportSessionRecord = {
      supportSessionId,
      requestedAt: at,
      source: String(input.source || "soft-twin").slice(0, 80),
      ticketId: ticket.id,
      tickets: [ticket],
      vulns: seedVulns,
      progress,
    };
    await writeSupportSession(rec);
    return toSnapshot(rec);
  }

  /** After authenticated Pragma handoff — attach opaque session for multi-device sync. */
  async attachAuthenticatedHandoff(input: {
    ticketId: string;
    tenantId: string;
    subject?: string;
    shortIds?: string[];
    fingerprints?: string[];
    source?: string;
  }): Promise<SupportSessionSnapshot> {
    const at = nowIso();
    const supportSessionId = newSupportSessionId();
    const ticket = sanitizeTicket({
      id: input.ticketId,
      subject: input.subject || "Prise en charge Pragma",
      status: "ouvert",
      updatedAt: at,
    });
    const vulns = (input.shortIds ?? []).map((id, i) =>
      sanitizeVuln(
        {
          id,
          title: `Finding ${id}`,
          risk: "signalé",
          status: "en revue",
          fingerprint: input.fingerprints?.[i],
        },
        ticket.id,
      ),
    );
    const progress: SupportProgressRow[] = [
      sanitizeProgress(
        {
          label: "Rapport transmis à Pragma",
          pct: 20,
          note: "Abonnement support — sync multi-appareil",
          updatedAt: at,
        },
        ticket.id,
      ),
    ];
    const rec: SupportSessionRecord = {
      supportSessionId,
      requestedAt: at,
      source: String(input.source || "atlas-client").slice(0, 80),
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      tickets: [ticket],
      vulns,
      progress,
    };
    await writeSupportSession(rec);
    return toSnapshot(rec);
  }

  async requireSession(supportSessionId: string): Promise<SupportSessionRecord> {
    const id = (supportSessionId || "").trim();
    if (!id) {
      throw new BadRequestException(
        "Header X-Atlas-Support-Session (opaque) requis",
      );
    }
    const rec = await readSupportSession(id);
    if (!rec) {
      throw new NotFoundException("Session support introuvable");
    }
    return rec;
  }

  async getSnapshot(supportSessionId: string): Promise<SupportSessionSnapshot> {
    return toSnapshot(await this.requireSession(supportSessionId));
  }

  async listTickets(supportSessionId: string) {
    const rec = await this.requireSession(supportSessionId);
    return { items: rec.tickets, supportSessionId: rec.supportSessionId };
  }

  async listVulns(supportSessionId: string) {
    const rec = await this.requireSession(supportSessionId);
    return { items: rec.vulns, supportSessionId: rec.supportSessionId };
  }

  async listProgress(supportSessionId: string) {
    const rec = await this.requireSession(supportSessionId);
    return { items: rec.progress, supportSessionId: rec.supportSessionId };
  }

  /**
   * Opt-in scanner ingest — only after handoff (session must exist).
   * Merges by fingerprint||id. Never accepts email/name fields.
   */
  async ingestVulns(
    supportSessionId: string,
    vulns: Array<Partial<SupportVulnRow>>,
  ): Promise<SupportSessionSnapshot> {
    const rec = await this.requireSession(supportSessionId);
    const ticketId = rec.tickets[0]?.id || shortId("TKT");
    const incoming = (vulns || []).map((v) => sanitizeVuln(v, ticketId));
    const byKey = new Map<string, SupportVulnRow>();
    for (const v of rec.vulns) {
      byKey.set(v.fingerprint || v.id, v);
    }
    for (const v of incoming) {
      const k = v.fingerprint || v.id;
      byKey.set(k, { ...(byKey.get(k) || {}), ...v });
    }
    rec.vulns = [...byKey.values()];
    const at = nowIso();
    rec.progress = [
      ...rec.progress,
      sanitizeProgress(
        {
          label: "Findings scanner (opt-in)",
          pct: Math.min(
            90,
            (rec.progress[rec.progress.length - 1]?.pct ?? 15) + 10,
          ),
          note: `${incoming.length} vulnérabilité(s) signalée(s)`,
          updatedAt: at,
        },
        ticketId,
      ),
    ].slice(-20);
    await writeSupportSession(rec);
    return toSnapshot(rec);
  }
}
