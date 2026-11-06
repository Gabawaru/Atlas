/**
 * Atlas product/ops mail helpers — atlas-secu.com from/replyTo.
 * Never log secret values; mail failures must not fail the product path.
 */
import { Logger } from "@nestjs/common";
import type { MailProvider, SendMailResult } from "./mail-provider";

export const ATLAS_MAIL_FROM = "gabriel@hq.atlas-secu.com";
export const ATLAS_MAIL_REPLY_TO = "gabriel@atlas-secu.com";

const log = new Logger("AtlasMailNotify");

/** Optional extra ops inbox (e.g. for E2E proof). Empty = skip. */
export function opsNotifyExtra(): string[] {
  const raw = (process.env.ATLAS_MAIL_OPS_TO ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function uniqEmails(...lists: (string | string[] | undefined)[]): string[] {
  const out = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const e of Array.isArray(list) ? list : [list]) {
      const v = e.trim().toLowerCase();
      if (v.includes("@")) out.add(v);
    }
  }
  return [...out];
}

/**
 * Fire-and-forget product notify. Returns null if no recipients or on error.
 * Never throws. Never logs addresses beyond count / provider / isMock / id.
 */
export async function safeNotify(
  mail: MailProvider,
  args: {
    to: string[];
    subject: string;
    text: string;
  },
): Promise<SendMailResult | null> {
  const to = uniqEmails(args.to, opsNotifyExtra());
  if (to.length === 0) {
    log.debug("skip notify — no recipients");
    return null;
  }
  try {
    const result = await mail.send({
      from: ATLAS_MAIL_FROM,
      replyTo: ATLAS_MAIL_REPLY_TO,
      to,
      subject: args.subject,
      text: args.text,
    });
    log.log(
      `notify ok provider=${result.provider} isMock=${result.isMock} id_present=${Boolean(result.id)} to_count=${to.length}`,
    );
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    // Strip accidental token-shaped substrings from error text
    log.warn(
      `notify failed to_count=${to.length} err=${msg.replace(/re_[A-Za-z0-9_]+/g, "re_[REDACTED]")}`,
    );
    return null;
  }
}
