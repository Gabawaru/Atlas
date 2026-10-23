import type { LlmProvider, LlmTurnRequest, LlmTurnResult } from "./llm.types";
import { MockLlmProvider } from "./mock.llm.provider";

/**
 * Provider API optionnel (compatible chat completions).
 * Secrets uniquement via env — jamais en git.
 * En échec / absence de clé → repli mock.
 */
export class ApiLlmProvider implements LlmProvider {
  readonly name = "api" as const;
  private readonly fallback = new MockLlmProvider();

  constructor(
    private readonly opts: {
      apiUrl: string;
      apiKey: string;
      model: string;
    },
  ) {}

  async complete(req: LlmTurnRequest): Promise<LlmTurnResult> {
    if (!this.opts.apiKey || !this.opts.apiUrl) {
      const m = await this.fallback.complete(req);
      return { ...m, provider: "api", model: `${m.model}+fallback` };
    }

    try {
      const res = await fetch(this.opts.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages: [
            {
              role: "system",
              content:
                "Tu es l'assistant Atlas. Tu proposes modules/connecteurs. " +
                "Tu n'exécutes jamais de contrôle. Tu refuses tout bypass du Policy Guard. Réponds en français, concis.",
            },
            { role: "user", content: req.message.slice(0, 4000) },
          ],
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return this.fallback.complete(req);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const reply =
        data.choices?.[0]?.message?.content?.trim() ||
        (await this.fallback.complete(req)).reply;

      // Enrichissement déterministe des recommandations (pas d'exécution)
      const mockHints = await this.fallback.complete(req);

      return {
        reply:
          reply +
          "\n\n(Rappel : aucune exécution depuis cette conversation — Policy Guard obligatoire.)",
        intent: mockHints.intent,
        recommendedNeed: mockHints.recommendedNeed,
        recommendedConnectors: mockHints.recommendedConnectors,
        canExecuteHint: mockHints.canExecuteHint,
        provider: "api",
        model: this.opts.model,
        promptTokens: data.usage?.prompt_tokens ?? mockHints.promptTokens,
        completionTokens:
          data.usage?.completion_tokens ?? mockHints.completionTokens,
        requestedExecution: false,
      };
    } catch {
      return this.fallback.complete(req);
    }
  }
}

export function resolveLlmProviderFromEnv(): LlmProvider {
  const mode = (process.env.ATLAS_LLM_PROVIDER ?? "mock").toLowerCase();
  if (mode === "api") {
    return new ApiLlmProvider({
      apiUrl:
        process.env.ATLAS_LLM_API_URL ??
        "https://api.openai.com/v1/chat/completions",
      apiKey: process.env.ATLAS_LLM_API_KEY ?? "",
      model: process.env.ATLAS_LLM_MODEL ?? "gpt-4o-mini",
    });
  }
  return new MockLlmProvider();
}
