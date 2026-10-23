import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { UX_NEEDS } from "@atlas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CONNECTOR_CATALOG } from "../connectors/connector.types";
import type { AuthUser } from "../auth/auth.types";
import { resolveLlmProviderFromEnv } from "./api.llm.provider";
import {
  ASSISTANT_DISCLAIMER,
  type LlmProvider,
  type LlmTurnResult,
} from "./llm.types";

function euroCentsForTokens(tokens: number): number {
  const per1m = Number(process.env.ATLAS_LLM_EURO_CENTS_PER_1M_TOKENS ?? "50");
  return Math.max(0, Math.ceil((tokens * per1m) / 1_000_000));
}

function fingerprintMessage(message: string): string {
  return createHash("sha256").update(message).digest("hex").slice(0, 16);
}

@Injectable()
export class AssistantService {
  private readonly provider: LlmProvider;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() provider?: LlmProvider,
  ) {
    this.provider = provider ?? resolveLlmProviderFromEnv();
  }

  /** Catalogue UX (sans LLM) — pour /ux-needs */
  suggestionsCatalog() {
    return UX_NEEDS.map((n) => ({
      id: n.id,
      label: n.label,
      mvpReady: n.mvpReady,
      status: n.status,
      statusLabel: n.statusLabel,
      connectorIds: [...n.connectorIds],
      note: n.statusLabel,
    }));
  }

  async usageStatus(tenantId: string) {
    const caps = await this.loadCaps(tenantId);
    const usage = await this.monthUsage(tenantId);
    return {
      usage: { ...usage, caps },
      disclaimer: ASSISTANT_DISCLAIMER,
      executed: false as const,
      provider: this.provider.name,
    };
  }

  async chat(user: AuthUser, message: string) {
    if (!user.tenantId) {
      throw new ForbiddenException("Contexte tenant requis pour l'assistant");
    }
    const tenantId = user.tenantId;

    const caps = await this.loadCaps(tenantId);
    const usage = await this.monthUsage(tenantId);
    const wouldTokens = Math.max(8, Math.ceil(message.length / 4)) + 64;
    const wouldEuro = euroCentsForTokens(wouldTokens);

    if (
      usage.tokens + wouldTokens > caps.tokenCap ||
      usage.euroCents + wouldEuro > caps.euroCapCents
    ) {
      await this.logUsage({
        tenantId,
        actorId: user.userId,
        provider: this.provider.name,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        estimatedEuroCents: 0,
        intent: "capped",
        message,
        executed: false,
        capped: true,
      });
      await this.audit.append({
        tenantId,
        actorId: user.userId,
        action: "llm.capped",
        objectType: "assistant",
        payload: {
          tokensUsed: usage.tokens,
          tokenCap: caps.tokenCap,
          euroCentsUsed: usage.euroCents,
          euroCapCents: caps.euroCapCents,
          // pas de message
        },
      });
      return {
        reply:
          "Plafond assistant atteint pour ce mois (tokens ou budget € estimé). Aucune exécution n'a lieu. Contactez le support A pour relever le plafond plan.",
        intent: "capped",
        recommendedNeed: null,
        recommendedConnectors: [] as string[],
        canExecuteHint: false,
        executed: false as const,
        jobEnqueued: false as const,
        llm: this.provider.name,
        disclaimer: ASSISTANT_DISCLAIMER,
        usage: { ...usage, caps },
        capped: true,
        suggestions: this.suggestionsCatalog(),
        connectors: this.connectorSummaries(),
      };
    }

    const raw = await this.provider.complete({ message });
    // Garde-fou central : jamais d'exécution depuis la conversation
    const safe = this.stripExecution(raw);

    const tokens = safe.promptTokens + safe.completionTokens;
    const euro = euroCentsForTokens(tokens);

    await this.logUsage({
      tenantId,
      actorId: user.userId,
      provider: safe.provider,
      model: safe.model ?? null,
      promptTokens: safe.promptTokens,
      completionTokens: safe.completionTokens,
      estimatedEuroCents: euro,
      intent: safe.intent,
      message,
      executed: false,
      capped: false,
    });

    await this.audit.append({
      tenantId,
      actorId: user.userId,
      action: "llm.turn",
      objectType: "assistant",
      payload: {
        provider: safe.provider,
        model: safe.model,
        intent: safe.intent,
        promptTokens: safe.promptTokens,
        completionTokens: safe.completionTokens,
        estimatedEuroCents: euro,
        messageFingerprint: fingerprintMessage(message),
        messageChars: message.length,
        executed: false,
        requestedExecutionIgnored: Boolean(raw.requestedExecution),
        recommendedNeed: safe.recommendedNeed,
        // Pas de prompt / pas de reply dans l'audit
      },
    });

    return {
      reply: safe.reply,
      intent: safe.intent,
      recommendedNeed: safe.recommendedNeed,
      recommendedConnectors: safe.recommendedConnectors,
      canExecuteHint: safe.canExecuteHint,
      executed: false as const,
      jobEnqueued: false as const,
      llm: safe.provider,
      model: safe.model,
      disclaimer: ASSISTANT_DISCLAIMER,
      usage: {
        tokens: usage.tokens + tokens,
        euroCents: usage.euroCents + euro,
        caps,
      },
      capped: false,
      suggestions: this.suggestionsCatalog(),
      connectors: this.connectorSummaries(),
    };
  }

  /**
   * Invariant testable : toute réponse assistant est non-exécutante.
   */
  stripExecution(raw: LlmTurnResult): LlmTurnResult {
    return {
      ...raw,
      requestedExecution: false,
      // canExecuteHint reste un indice UX — le client ne doit pas s'en servir pour skipper le guard
    };
  }

  private connectorSummaries() {
    return CONNECTOR_CATALOG.map((c) => ({
      id: c.id,
      label: c.label,
      productionReady: c.productionReady,
      isStub: c.isStub,
      statusLabel: c.statusLabel,
    }));
  }

  private async loadCaps(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: { in: ["active", "trialing"] } },
      include: { plan: true },
      orderBy: { startsAt: "desc" },
    });
    return {
      tokenCap: sub?.plan.llmTokenCapMonthly ?? 200_000,
      euroCapCents: sub?.plan.llmEuroCapCentsMonthly ?? 500,
      planCode: sub?.plan.code ?? null,
    };
  }

  private async monthUsage(tenantId: string) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.llmUsageLog.findMany({
      where: { tenantId, createdAt: { gte: start }, capped: false },
      select: { promptTokens: true, completionTokens: true, estimatedEuroCents: true },
    });
    let tokens = 0;
    let euroCents = 0;
    for (const r of rows) {
      tokens += r.promptTokens + r.completionTokens;
      euroCents += r.estimatedEuroCents;
    }
    return { tokens, euroCents };
  }

  private async logUsage(input: {
    tenantId: string;
    actorId: string;
    provider: string;
    model: string | null;
    promptTokens: number;
    completionTokens: number;
    estimatedEuroCents: number;
    intent: string;
    message: string;
    executed: boolean;
    capped: boolean;
  }) {
    await this.prisma.llmUsageLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        provider: input.provider,
        model: input.model,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        estimatedEuroCents: input.estimatedEuroCents,
        intent: input.intent,
        messageFingerprint: fingerprintMessage(input.message),
        messageChars: input.message.length,
        executed: false, // forcé
        capped: input.capped,
      },
    });
  }
}
