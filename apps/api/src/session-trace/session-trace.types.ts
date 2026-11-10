/** Gabriel session journal bubble — mirrors client TraceMessage (thin bridge). */

export type SessionTraceRole = "prompt" | "agent";

export type SessionTraceMessage = {
  id: string;
  role: SessionTraceRole;
  text: string;
  at: string;
  details: {
    commands?: string[];
    done?: string[];
    reasons?: string[];
    reasoning?: string;
    communication?: string;
  };
};

export const SESSION_TRACE_MAX = 80;

export function isSessionTraceMessage(x: unknown): x is SessionTraceMessage {
  if (!x || typeof x !== "object") return false;
  const m = x as Partial<SessionTraceMessage>;
  return (
    typeof m.id === "string" &&
    (m.role === "prompt" || m.role === "agent") &&
    typeof m.text === "string" &&
    typeof m.at === "string" &&
    typeof m.details === "object" &&
    m.details !== null
  );
}
