import { FormEvent, useEffect, useMemo, useState } from "react";
import { sendAgentRedirect } from "./agentRedirect";
import {
  AGENT_STATUS_LABEL,
  GABRIEL_AGENT_STATUS,
  SESSION_TRACE_SEED,
  chronologicalTrace,
  summarizeTrace,
  type AgentRunStatus,
  type TraceMessage,
} from "./sessionTrace";
import {
  LIVE_TRACE_EVENT,
  appendRedirectTrace,
  hydrateLiveFromDurable,
  loadLiveTrace,
  mergeSeedAndLive,
} from "./sessionTraceLive";
import type { TraceBridge } from "./sessionTraceBridge";

type Props = {
  messages?: TraceMessage[];
  status?: AgentRunStatus;
  apiBase: string;
  token: string | null;
  onBack: () => void;
  onRedirectQueued?: (text: string) => void;
};

function formatTime(iso: string): string {
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

function TraceBubble({ message }: { message: TraceMessage }) {
  const [open, setOpen] = useState(false);
  const d = message.details;
  const hasDetails =
    (d.commands?.length ?? 0) > 0 ||
    (d.done?.length ?? 0) > 0 ||
    (d.reasons?.length ?? 0) > 0 ||
    Boolean(d.reasoning) ||
    Boolean(d.communication);

  return (
    <article
      className={`trace-bubble trace-${message.role}`}
      aria-label={message.role === "prompt" ? "Prompt" : "Agent"}
    >
      <header className="trace-bubble-head">
        <span className="trace-role">
          {message.role === "prompt" ? "Gabriel" : "Agent"}
        </span>
        <time dateTime={message.at}>{formatTime(message.at)}</time>
      </header>
      <p className="trace-text">{message.text}</p>
      {hasDetails && (
        <div className="trace-details">
          <button
            type="button"
            className="trace-chevron"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`chev ${open ? "open" : ""}`} aria-hidden="true">
              ▸
            </span>
            {open ? "Masquer" : "Détails"}
          </button>
          {open && (
            <div className="trace-detail-body">
              {d.commands && d.commands.length > 0 && (
                <section>
                  <h3>Commandes</h3>
                  <ul>
                    {d.commands.map((c) => (
                      <li key={c}>
                        <code>{c}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {d.done && d.done.length > 0 && (
                <section>
                  <h3>Fait</h3>
                  <ul>
                    {d.done.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              {d.reasons && d.reasons.length > 0 && (
                <section>
                  <h3>Pourquoi</h3>
                  <ul>
                    {d.reasons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}
              {d.reasoning && (
                <section>
                  <h3>Raisonnement</h3>
                  <p>{d.reasoning}</p>
                </section>
              )}
              {d.communication && (
                <section>
                  <h3>Échanges</h3>
                  <p>{d.communication}</p>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function SessionTracePage({
  messages,
  status = GABRIEL_AGENT_STATUS,
  apiBase,
  token,
  onBack,
  onRedirectQueued,
}: Props) {
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendInfo, setSendInfo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [live, setLive] = useState<TraceMessage[]>(() => loadLiveTrace());
  const [durableHint, setDurableHint] = useState<string | null>(null);

  const bridge: TraceBridge | null =
    token && apiBase ? { apiBase, token } : null;

  useEffect(() => {
    const refresh = () => setLive(loadLiveTrace());
    const onLive = () => refresh();
    window.addEventListener(LIVE_TRACE_EVENT, onLive);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(LIVE_TRACE_EVENT, onLive);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  /** Hydrate from durable file bridge when session token present. */
  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void hydrateLiveFromDurable(bridge).then((r) => {
      if (cancelled) return;
      setLive(r.messages);
      if (r.bridge === "file") {
        setDurableHint("Pont durable Atlas · API fichier");
      } else if (r.bridge === "error") {
        setDurableHint("Pont durable indisponible — cache local");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bridge?.apiBase, bridge?.token]);

  const seed = messages ?? SESSION_TRACE_SEED;
  const thread = useMemo(
    () => chronologicalTrace(mergeSeedAndLive(seed, live)),
    [seed, live],
  );
  const summary = useMemo(
    () => summarizeTrace(thread, status),
    [thread, status],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sendBusy) return;
    setSendBusy(true);
    setSendError(null);
    setSendInfo(null);
    try {
      const result = await sendAgentRedirect({
        message: draft,
        apiBase,
        token,
      });
      appendRedirectTrace(
        {
          id: result.queued.id,
          message: draft.trim(),
          api: result.api,
        },
        undefined,
        bridge,
      );
      setLive(loadLiveTrace());
      onRedirectQueued?.(draft.trim());
      setDraft("");
      if (result.api === "ok") {
        setSendInfo("Message enfilé + /v1/conversation OK · journal durable.");
      } else if (result.api === "skipped") {
        setSendInfo("Message enfilé (local). API conversation ignorée — pas de jeton.");
      } else {
        setSendInfo("Message enfilé (local + journal).");
        setSendError(result.apiDetail ?? "Bridge conversation en erreur.");
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <section
      id="session-trace"
      className="session-trace"
      aria-label="Journal d'activité — session Gabriel"
    >
      <div className="trace-toolbar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Session Gabriel
        </button>
        <h2>Activité</h2>
        <p
          className={`agent-status agent-status-${status}`}
          role="status"
          aria-live="polite"
        >
          <span className="agent-status-dot" aria-hidden="true" />
          Agent · {AGENT_STATUS_LABEL[status]}
        </p>
      </div>

      <aside className="trace-summary" aria-label="Résumé auto">
        <p className="trace-summary-headline">{summary.headline}</p>
        <ul>
          {summary.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {durableHint && <p className="muted trace-durable-hint">{durableHint}</p>}
      </aside>

      <div className="trace-thread" role="log" aria-live="polite">
        {thread.map((m) => (
          <TraceBubble key={m.id} message={m} />
        ))}
      </div>

      <form className="trace-composer" onSubmit={(e) => void onSubmit(e)}>
        <label htmlFor="gabriel-agent-msg">Message à l’agent</label>
        <textarea
          id="gabriel-agent-msg"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Rediriger le travail en cours (sans redémarrer)…"
          disabled={sendBusy}
        />
        <button type="submit" className="cta-scanner" disabled={sendBusy || !draft.trim()}>
          {sendBusy ? "…" : "Envoyer"}
        </button>
        {sendInfo && <p className="muted">{sendInfo}</p>}
        {sendError && (
          <p className="block-reason" role="alert">
            {sendError}
          </p>
        )}
      </form>
    </section>
  );
}
