/**
 * Contrat provider LLM — l'assistant propose, n'exécute jamais.
 */
export interface LlmTurnRequest {
  message: string;
  /** Contexte non sensible (catalogues) — pas de secrets */
  catalogSummary?: string;
}

export interface LlmTurnResult {
  reply: string;
  intent: string;
  recommendedNeed: string | null;
  recommendedConnectors: string[];
  /** Indice UX seulement — ne lance rien */
  canExecuteHint: boolean;
  provider: "mock" | "api";
  model?: string;
  promptTokens: number;
  completionTokens: number;
  /**
   * Toujours false côté service — toute tentative d'exécution
   * depuis le provider est ignorée.
   */
  requestedExecution?: boolean;
}

export interface LlmProvider {
  readonly name: "mock" | "api";
  complete(req: LlmTurnRequest): Promise<LlmTurnResult>;
}

export const ASSISTANT_DISCLAIMER =
  "L'IA propose modules/connecteurs mais n'exécute jamais sans Policy Guard. " +
  "Elle ne s'auto-accorde pas de droits. Aucune mission n'est lancée depuis la conversation.";
