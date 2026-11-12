/**
 * Gab → Ben notifications bridge — thin HTTP to API file store.
 * Shape mirrors docs/roe-bot-reports.md (Verdict / Faits / Bloquants).
 */

export type GabNotification = {
  id: string;
  source: "gab";
  at: string;
  title: string;
  verdict: string;
  faits: string;
  bloquants: string;
  next?: string;
  read: boolean;
  needsBen: boolean;
};

export type NotificationsPull = {
  items: GabNotification[];
  unread: number;
  bridge: "file" | "error" | "none";
  detail?: string;
};

const POLL_MS = 10_000;

export function notificationsPollMs(): number {
  return POLL_MS;
}

function baseUrl(apiBase: string): string {
  return `${apiBase.replace(/\/$/, "")}/v1/notifications`;
}

export async function pullNotifications(
  apiBase: string,
  token: string,
): Promise<NotificationsPull> {
  try {
    const res = await fetch(baseUrl(apiBase), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return {
        items: [],
        unread: 0,
        bridge: "error",
        detail: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      items?: GabNotification[];
      unread?: number;
    };
    const items = Array.isArray(body.items) ? body.items : [];
    const unread =
      typeof body.unread === "number"
        ? body.unread
        : items.filter((n) => !n.read).length;
    return { items, unread, bridge: "file" };
  } catch (e) {
    return {
      items: [],
      unread: 0,
      bridge: "error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function markNotificationRead(
  apiBase: string,
  token: string,
  id: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(apiBase)}/${encodeURIComponent(id)}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function formatNotifTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
