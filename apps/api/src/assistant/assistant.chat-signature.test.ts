import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AssistantService } from "./assistant.service";
import type { LlmProvider, LlmTurnResult } from "./llm.types";
import type {
  SignatureProvider,
  SignedAuthorizationRequest,
  SignedAuthorizationResult,
  SignedAuthorizationStatus,
} from "../signatures/signature-provider";
import type { AuthUser } from "../auth/auth.types";

function stubSignatures(
  status: SignedAuthorizationStatus,
): SignatureProvider {
  return {
    name: "mock",
    async createEnvelope() {
      throw new Error("missions path unused in chat gate test");
    },
    async completeSigner() {
      return "pending";
    },
    async getStatus() {
      return "pending";
    },
    async fetchArtifact() {
      throw new Error("unused");
    },
    async sign(
      _req: SignedAuthorizationRequest,
    ): Promise<SignedAuthorizationResult> {
      return {
        status,
        provider: "mock",
        requestId: `test-authz-${status}`,
        isMock: true,
      };
    },
  };
}

function stubLlm(calls: { n: number }): LlmProvider {
  return {
    name: "mock",
    async complete(): Promise<LlmTurnResult> {
      calls.n += 1;
      return {
        reply: "réponse mock autorisée",
        intent: "web_presence",
        recommendedNeed: "web_presence",
        recommendedConnectors: ["web.passive.presence"],
        canExecuteHint: true,
        provider: "mock",
        promptTokens: 10,
        completionTokens: 20,
      };
    },
  };
}

function stubPrisma() {
  return {
    subscription: {
      findMany: async () => [],
    },
    llmUsageLog: {
      findMany: async () => [],
      create: async () => ({}),
    },
  };
}

function stubAudit(actions: string[]) {
  return {
    append: async (row: { action: string }) => {
      actions.push(row.action);
      return {};
    },
  };
}

const user: AuthUser = {
  userId: "u1",
  email: "camille@demo.local",
  displayName: "Camille",
  tenantId: "t-demo",
  tenantRole: "owner",
  staffRoles: [],
};

describe("assistant — gate signature avant réponse LLM", () => {
  it("pending : pas d'appel LLM, intent signature_required", async () => {
    const llmCalls = { n: 0 };
    const actions: string[] = [];
    const svc = new AssistantService(
      stubPrisma() as never,
      stubAudit(actions) as never,
      stubSignatures("pending"),
      stubLlm(llmCalls),
    );
    const out = await svc.chat(user, "Que voit-on de nous sur Internet ?");
    assert.equal(llmCalls.n, 0);
    assert.equal(out.intent, "signature_required");
    assert.equal(out.executed, false);
    assert.equal(out.jobEnqueued, false);
    assert.equal(out.signatureStatus, "pending");
    assert.match(out.reply, /Autorisation signée requise/i);
    assert.ok(actions.includes("llm.signature_required"));
  });

  it("rejected : pas d'appel LLM", async () => {
    const llmCalls = { n: 0 };
    const svc = new AssistantService(
      stubPrisma() as never,
      stubAudit([]) as never,
      stubSignatures("rejected"),
      stubLlm(llmCalls),
    );
    const out = await svc.chat(user, "aide pentest");
    assert.equal(llmCalls.n, 0);
    assert.equal(out.intent, "signature_required");
    assert.equal(out.signatureStatus, "rejected");
    assert.match(out.reply, /refusée/i);
  });

  it("signed : appelle le LLM et conserve non-exécution", async () => {
    const llmCalls = { n: 0 };
    const actions: string[] = [];
    const svc = new AssistantService(
      stubPrisma() as never,
      stubAudit(actions) as never,
      stubSignatures("signed"),
      stubLlm(llmCalls),
    );
    const out = await svc.chat(user, "Que voit-on de nous sur Internet ?");
    assert.equal(llmCalls.n, 1);
    assert.equal(out.executed, false);
    assert.equal(out.jobEnqueued, false);
    assert.equal(out.intent, "web_presence");
    assert.match(out.reply, /réponse mock autorisée/);
    assert.ok(actions.includes("llm.turn"));
    assert.ok(!actions.includes("llm.signature_required"));
  });
});
