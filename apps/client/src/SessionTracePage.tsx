import { FormEvent, useMemo, useState } from "react";
import { sendAgentRedirect } from "./agentRedirect";
import {
  AGENT_STATUS_LABEL,
  GABRIEL_AGENT_STATUS,
  chronologicalTrace,
  summarizeTrace,
  type AgentRunStatus,
  type TraceMessage,
} from "./sessionTrace";

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
  const [extra, setExtra] = useState<TraceMessage[]>([]);

  const thread = useMemo(
    () => chronologicalTrace([...(messages ?? []), ...extra]),
    [messages, extra],
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
      const now = new Date().toISOString();
      setExtra((prev) => [
        ...prev,
        {
          id: result.queued.id,
          role: "prompt",
          text: draft.trim(),
          at: now,
          details: {
            reasons: ["Redirection agent sans redémarrage (session Gabriel)."],
            communication: `File locale + bridge API = ${result.api}`,
          },
        },
      ]);
      onRedirectQueued?.(draft.trim());
      setDraft("");
      if (result.api === "ok") {
        setSendInfo("Message enfilé + /v1/conversation OK.");
      } else if (result.api === "skipped") {
        setSendInfo("Message enfilé (local). API ignorée — pas de jeton.");
      } else {
        setSendInfo("Message enfilé (local).");
        setSendError(result.apiDetail ?? "Bridge API en erreur.");
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
