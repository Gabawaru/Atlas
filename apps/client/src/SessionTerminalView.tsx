import { useState } from "react";
import {
  LOCAL_SHELL_COMMANDS,
  runLocalShellCommand,
  type LocalShellCommandId,
  type LocalShellResult,
} from "./localShell";

type Props = {
  onBack: () => void;
  onLaunchScan: () => void;
};

export function SessionTerminalView({ onBack, onLaunchScan }: Props) {
  const [log, setLog] = useState<LocalShellResult[]>([]);
  const [busyId, setBusyId] = useState<LocalShellCommandId | null>(null);

  async function run(id: LocalShellCommandId) {
    setBusyId(id);
    try {
      if (id === "launch-scan") {
        const r = await runLocalShellCommand(id);
        setLog((prev) => [r, ...prev].slice(0, 40));
        onLaunchScan();
        return;
      }
      const r = await runLocalShellCommand(id);
      setLog((prev) => [r, ...prev].slice(0, 40));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="tracking-view session-terminal" aria-label="Session locale">
      <header className="tracking-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Session
        </button>
        <div className="tracking-header-text">
          <h2>Session · terminal local</h2>
          <p className="tracking-lede muted">
            Actions générales vers le soft local (:17865 / API). Pas un second Scanner.
          </p>
        </div>
      </header>

      <div className="session-term-commands" role="group" aria-label="Commandes">
        {LOCAL_SHELL_COMMANDS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ghost session-term-cmd"
            disabled={busyId !== null}
            title={c.hint}
            onClick={() => void run(c.id)}
          >
            {busyId === c.id ? "…" : c.label}
          </button>
        ))}
      </div>

      <div className="session-term-log" aria-live="polite" aria-label="Journal">
        {log.length === 0 ? (
          <p className="muted tracking-empty">Aucune commande. Essayez Shell /healthz.</p>
        ) : (
          <ul className="session-term-entries">
            {log.map((entry, i) => (
              <li
                key={`${entry.at}-${entry.commandId}-${i}`}
                data-ok={entry.ok ? "1" : "0"}
              >
                <div className="session-term-meta">
                  <strong>{entry.commandId}</strong>
                  <span className="muted">
                    {entry.status != null ? `HTTP ${entry.status}` : "local"} ·{" "}
                    {entry.at.slice(11, 19)}
                  </span>
                  <span className={entry.ok ? "session-term-ok" : "session-term-fail"}>
                    {entry.ok ? "ok" : "fail"}
                  </span>
                </div>
                <pre>{entry.body}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
