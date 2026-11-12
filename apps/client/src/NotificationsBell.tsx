import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatNotifTime,
  markNotificationRead,
  notificationsPollMs,
  pullNotifications,
  type GabNotification,
} from "./notifications";

type Props = {
  apiBase: string;
  token: string;
};

export function NotificationsBell({ apiBase, token }: Props) {
  const [items, setItems] = useState<GabNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<GabNotification | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const r = await pullNotifications(apiBase, token);
    if (r.bridge === "file") {
      setItems(r.items);
      setUnread(r.unread);
      setBridgeError(null);
      setDetail((prev) =>
        prev ? r.items.find((n) => n.id === prev.id) ?? prev : null,
      );
    } else if (r.bridge === "error") {
      setBridgeError(r.detail ?? "pont indisponible");
    }
  }, [apiBase, token]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), notificationsPollMs());
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (detail) setDetail(null);
        else setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, detail]);

  async function openItem(n: GabNotification) {
    setDetail(n);
    if (!n.read) {
      const ok = await markNotificationRead(apiBase, token, n.id);
      if (ok) {
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        );
        setUnread((u) => Math.max(0, u - 1));
        setDetail((d) => (d && d.id === n.id ? { ...d, read: true } : d));
      }
    }
  }

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label={
          unread > 0
            ? `Notifications Gab, ${unread} non lues`
            : "Notifications Gab"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          className="notif-bell-glyph"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
        </svg>
        {unread > 0 && (
          <span className="notif-badge" data-testid="notif-badge">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="notif-panel"
          role="dialog"
          aria-label="Notifications Gab"
        >
          <header className="notif-panel-head">
            <strong>Gab</strong>
            <span className="muted">mises à jour</span>
          </header>
          {bridgeError && (
            <p className="notif-bridge-err muted" role="status">
              {bridgeError}
            </p>
          )}
          {items.length === 0 ? (
            <p className="muted notif-empty">Aucune notification.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-item${n.read ? "" : " unread"}${
                      n.needsBen ? " needs-ben" : ""
                    }`}
                    onClick={() => void openItem(n)}
                  >
                    <span className="notif-item-title">{n.title}</span>
                    <span className="notif-item-meta muted">
                      {n.needsBen ? "besoin de toi · " : ""}
                      {formatNotifTime(n.at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {detail && (
        <div
          className="notif-detail-backdrop"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <article
            className="notif-detail"
            role="dialog"
            aria-label={detail.title}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="notif-detail-head">
              <p className="session-chip muted">Gab · rapport</p>
              <button
                type="button"
                className="ghost"
                onClick={() => setDetail(null)}
              >
                Fermer
              </button>
            </header>
            <h2>{detail.title}</h2>
            <time className="muted" dateTime={detail.at}>
              {formatNotifTime(detail.at)}
            </time>
            <dl className="notif-detail-dl">
              <div>
                <dt>Verdict</dt>
                <dd>{detail.verdict}</dd>
              </div>
              <div>
                <dt>Faits</dt>
                <dd>{detail.faits}</dd>
              </div>
              <div>
                <dt>Bloquants</dt>
                <dd>{detail.bloquants}</dd>
              </div>
              {detail.next && (
                <div>
                  <dt>Next</dt>
                  <dd>{detail.next}</dd>
                </div>
              )}
            </dl>
          </article>
        </div>
      )}
    </div>
  );
}
