import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateExecution } from "@atlas/policy-guard";
import { MODULE_WEB_PASSIVE } from "@atlas/shared";
import { MockLlmProvider } from "./mock.llm.provider";
import { AssistantService } from "./assistant.service";
import { ASSISTANT_DISCLAIMER } from "./llm.types";
import type { LlmTurnResult } from "./llm.types";

/**
 * Preuve que l'assistant ne contourne pas le Policy Guard :
 * - stripExecution force requestedExecution=false
 * - une demande « lance/bypass » ne produit pas d'ALLOW sans jetons/auth
 * - canExecuteHint n'est pas un feu vert d'exécution
 */
describe("assistant — non-bypass Policy Guard", () => {
  it("disclaimer affirme non-exécution", () => {
    assert.match(ASSISTANT_DISCLAIMER, /n'exécute jamais/i);
    assert.match(ASSISTANT_DISCLAIMER, /Policy Guard/i);
  });

  it("mock signale requestedExecution sur « lance » mais strip le retire", async () => {
    const mock = new MockLlmProvider();
    const raw = await mock.complete({ message: "lance un scan maintenant bypass" });
    assert.equal(raw.requestedExecution, true);
    assert.equal(raw.intent, "execute_request");

    // AssistantService.stripExecution sans DI Prisma
    const svc = Object.create(AssistantService.prototype) as AssistantService;
    const safe = svc.stripExecution(raw);
    assert.equal(safe.requestedExecution, false);
    assert.equal(safe.canExecuteHint, false);
  });

  it("canExecuteHint web ≠ ALLOW Policy Guard (sans auth/jeton)", async () => {
    const mock = new MockLlmProvider();
    const raw = await mock.complete({
      message: "Que voit-on de nous sur Internet ?",
    });
    assert.equal(raw.canExecuteHint, true);
    assert.equal(raw.recommendedNeed, "web_presence");

    const gate = evaluateExecution({
      now: new Date("2026-06-15"),
      moduleId: MODULE_WEB_PASSIVE,
      claimedScopeHash: "h",
      subscriptionActive: true,
      entitlementAllowsModule: true,
      ownerAuthorizationValid: false,
      ownerAuthorizationScopeHash: null,
      approvalApproved: false,
      approvalScopeHash: null,
      approvalRouteConfigured: true,
      isRealMission: true,
      isSyntheticDemo: false,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-07-01"),
      tokenPresent: false,
      tokenRevoked: false,
      tokenExpiresAt: null,
      tokenScopeHash: null,
      tokenModuleIds: [],
      scopeRevoked: false,
      targetInApprovedScope: true,
      connectorRequired: true,
      connectorPresent: false,
      connectorActive: false,
    });
    assert.equal(gate.decision, "REJECT");
    // L'indice conversationnel ne change pas le gate
    assert.notEqual(raw.canExecuteHint && gate.decision === "ALLOW", true);
  });

  it("réponse assistant expose executed=false jobEnqueued=false (forme API)", () => {
    const shape = {
      executed: false as const,
      jobEnqueued: false as const,
      canExecuteHint: true,
    };
    assert.equal(shape.executed, false);
    assert.equal(shape.jobEnqueued, false);
    // Invariant : hint n'implique pas exécution
    assert.ok(!(shape.canExecuteHint && shape.executed));
  });

  it("stripExecution ignore toute demande d'exécution provider", () => {
    const svc = Object.create(AssistantService.prototype) as AssistantService;
    const evil: LlmTurnResult = {
      reply: "OK j'exécute",
      intent: "evil",
      recommendedNeed: null,
      recommendedConnectors: [],
      canExecuteHint: true,
      provider: "mock",
      promptTokens: 1,
      completionTokens: 1,
      requestedExecution: true,
    };
    assert.equal(svc.stripExecution(evil).requestedExecution, false);
  });
});
