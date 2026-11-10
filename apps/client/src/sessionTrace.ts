/**
 * Gabriel session — in-app agent activity trail (#session/trace).
 * Seeded when store HTML (`atlas-traceability.html`) is not loadable in-client.
 */

export type TraceRole = "prompt" | "agent";

export type AgentRunStatus = "working" | "paused" | "blocked";

export type TraceMessage = {
  id: string;
  role: TraceRole;
  /** Short bubble text (SMS-style). */
  text: string;
  /** ISO timestamp for chronological order. */
  at: string;
  /** Expandable details — commands, actions, reasons, reasoning, prompt↔agent. */
  details: {
    commands?: string[];
    done?: string[];
    reasons?: string[];
    reasoning?: string;
    communication?: string;
  };
};

export type TraceSummary = {
  /** One-liner “where I am” for Gabriel on return. */
  headline: string;
  /** 1–3 bullets max. */
  bullets: string[];
};

export const AGENT_STATUS_LABEL: Record<AgentRunStatus, string> = {
  working: "En cours",
  paused: "En pause",
  blocked: "Bloqué",
};

/** Default status for Gabriel’s open session trail. */
export const GABRIEL_AGENT_STATUS: AgentRunStatus = "working";

/** Chronological seed — Gabriel (stagiaire) session trail. */
export const SESSION_TRACE_SEED: TraceMessage[] = [
  {
    id: "t1",
    role: "prompt",
    text: "Gabriel — aligner le Scanner sur les tokens teal atlas-secu.com.",
    at: "2026-11-10T10:00:00.000Z",
    details: {
      reasons: ["Marque Atlas only — une palette site ↔ client."],
      communication: "Session Gabriel → agent UI Scanner.",
    },
  },
  {
    id: "t2",
    role: "agent",
    text: "Scanner aligné teal (#64). Miroir docs/atlas-tokens.css.",
    at: "2026-11-10T10:18:00.000Z",
    details: {
      commands: [
        "edit apps/client/src/styles.css",
        "add docs/atlas-tokens.css",
      ],
      done: [
        "Variables --teal / --teal-deep / --teal-soft sur le client",
        "PR #64 mergée",
      ],
      reasons: ["Éviter une 2ᵉ identité visuelle hors Atlas."],
      reasoning:
        "Réutiliser les tokens site plutôt que inventer une palette Scanner.",
      communication: "Agent → Gabriel : PR ready-for-review.",
    },
  },
  {
    id: "t3",
    role: "prompt",
    text: "Gabriel — tableau risque / compromission sur les résultats Presence.",
    at: "2026-11-10T11:05:00.000Z",
    details: {
      reasons: ["Un écran lisible hors dump JSON."],
      communication: "Scope Scanner results — pas le hero CTA.",
    },
  },
  {
    id: "t4",
    role: "agent",
    text: "Table risque livrée (#63). Une ligne par URL hôte.",
    at: "2026-11-10T11:40:00.000Z",
    details: {
      commands: [
        "edit apps/client/src/riskTable.ts",
        "edit apps/client/src/App.tsx",
        "node --import tsx --test src/riskTable.test.ts",
      ],
      done: [
        "riskTableFromReportExport → UI tableau",
        "Fix une ligne par host URL",
      ],
      reasons: ["Preuve live > résumé narratif."],
      reasoning:
        "Dériver le tableau du exportJson déjà produit par l’API, zéro second pipeline.",
      communication: "Agent → Gabriel : merge #63 après smoke.",
    },
  },
  {
    id: "t5",
    role: "agent",
    text: "Multi-OS + /healthz (#65) · suivi vulns CCV/PDF.md (#66) sur main.",
    at: "2026-11-10T15:31:50.000Z",
    details: {
      done: [
        "PR #65 mergée — shell Win/Linux/macOS + GET /healthz",
        "PR #66 mergée — tables suivi hors hero Scanner",
      ],
      reasons: ["Gap Windows Atlas.exe /healthz 404 comblé via multi-OS."],
      communication: "Ben-proxy → land CI verts.",
    },
  },
  {
    id: "t6",
    role: "agent",
    text: "Session locale #terminal ↔ :17865 (#67).",
    at: "2026-11-10T15:36:33.000Z",
    details: {
      commands: [
        "add apps/client/src/localShell.ts",
        "add apps/client/src/SessionTerminalView.tsx",
        "CORS shell localhost + atlas-secu.com",
      ],
      done: [
        "Stubs healthz / start-api / api-health / launch-scan",
        "PR #67 mergée",
      ],
      reasons: ["Bridge site session ↔ soft local — pas un 2ᵉ Scanner."],
    },
  },
  {
    id: "t7",
    role: "prompt",
    text: "Gabriel — bouton session : journal d’activité agent en fil SMS, page dédiée.",
    at: "2026-11-10T15:30:00.000Z",
    details: {
      reasons: [
        "Traçabilité prompt↔agent sans polluer le hero Scanner",
        "Session Gabriel = point d’entrée naturel (stagiaire)",
      ],
      communication:
        "Scope : session Gabriel → #session/trace chat (status + DM + résumé).",
    },
  },
  {
    id: "t8",
    role: "agent",
    text: "Journal SMS #session/trace livré et mergé (#68).",
    at: "2026-11-10T15:45:43.000Z",
    details: {
      commands: [
        "add apps/client/src/sessionRoute.ts",
        "add apps/client/src/sessionTrace.ts",
        "add apps/client/src/agentRedirect.ts",
        "add apps/client/src/SessionTracePage.tsx",
      ],
      done: [
        "Hub #session Gabriel + fil chat",
        "Status + résumé + redirect locale/API",
        "PR #68 mergée (CI vert)",
      ],
      reasons: [
        "Store HTML atlas-traceability.html pas chargeable côté Vite → seed produit",
      ],
      reasoning:
        "Hash léger ; page dédiée ; redirect sans redémarrer via queue locale + bridge API.",
      communication: "Piste Ben-proxy affichable — session = Gabriel.",
    },
  },
];

export function chronologicalTrace(
  messages: TraceMessage[] = SESSION_TRACE_SEED,
): TraceMessage[] {
  return [...messages].sort((a, b) => a.at.localeCompare(b.at));
}

/** Auto “où j’en suis” — last agent turn + open prompt, musk-short. */
export function summarizeTrace(
  messages: TraceMessage[] = SESSION_TRACE_SEED,
  status: AgentRunStatus = GABRIEL_AGENT_STATUS,
): TraceSummary {
  const ordered = chronologicalTrace(messages);
  const lastAgent = [...ordered].reverse().find((m) => m.role === "agent");
  const lastPrompt = [...ordered].reverse().find((m) => m.role === "prompt");
  const headline = lastAgent
    ? `Gabriel — ${AGENT_STATUS_LABEL[status].toLowerCase()} : ${lastAgent.text}`
    : `Gabriel — session ${AGENT_STATUS_LABEL[status].toLowerCase()}.`;
  const bullets: string[] = [];
  if (lastPrompt) bullets.push(`Dernier prompt : ${lastPrompt.text}`);
  if (lastAgent?.details.done?.[0]) {
    bullets.push(`Dernier fait : ${lastAgent.details.done[0]}`);
  }
  if (status === "blocked") {
    bullets.push("Action : débloquer via message ci-dessous.");
  } else if (status === "paused") {
    bullets.push("Action : reprendre ou rediriger via message.");
  } else {
    bullets.push("Message ci-dessous redirige l’agent sans redémarrer.");
  }
  return { headline, bullets: bullets.slice(0, 3) };
}
