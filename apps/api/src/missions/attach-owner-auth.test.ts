/**
 * attachExistingOwnerAuth — bind signed envelope without createEnvelope /request.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { MissionsService } from "./missions.service";
import type { SignatureProvider } from "../signatures/signature-provider";
import type { AuthUser } from "../auth/auth.types";

const user: AuthUser = {
  userId: "u1",
  email: "owner@t.local",
  displayName: "Owner",
  tenantId: "ten1",
  tenantRole: "owner",
  staffRoles: [],
};

const scope = {
  id: "scope1",
  version: 1,
  scopeHash: "hash-abc",
  exclusions: [],
  methods: ["passive"],
  revokedAt: null,
  periodEnd: new Date("2099-01-01"),
};

function baseMission(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    tenantId: "ten1",
    status: "PREP_READY",
    synthetic: false,
    isRealMission: true,
    moduleIds: ["web.passive.presence.v1"],
    blockedReason: null,
    scopeVersions: [scope],
    ownerAuths: [],
    approvalReqs: [],
    tokens: [],
    ...overrides,
  };
}

function makeService(opts: {
  getStatus: SignatureProvider["getStatus"];
  fetchArtifact?: SignatureProvider["fetchArtifact"];
  onCreateEnvelope?: () => void;
  onCreateAuth?: (data: Record<string, unknown>) => void;
}) {
  const providerCalls: string[] = [];
  const signatures: SignatureProvider = {
    name: "pragma-sign",
    async createEnvelope() {
      providerCalls.push("createEnvelope");
      opts.onCreateEnvelope?.();
      throw new Error("createEnvelope must not be called");
    },
    async completeSigner() {
      providerCalls.push("completeSigner");
      return "signed";
    },
    getStatus: async (id) => {
      providerCalls.push(`getStatus:${id}`);
      return opts.getStatus(id);
    },
    fetchArtifact: async (id) => {
      providerCalls.push(`fetchArtifact:${id}`);
      if (opts.fetchArtifact) return opts.fetchArtifact(id);
      return {
        artifactRef: `pragma-sign://signature/${id}/pdf`,
        contentHash: "c0ffee",
        isMock: false,
        signedBy: ["owner@t.local"],
      };
    },
    async sign() {
      providerCalls.push("sign");
      throw new Error("sign must not be called");
    },
  };

  let missionStatus = "PREP_READY";
  const createdAuths: Record<string, unknown>[] = [];

  const prisma = {
    mission: {
      findFirst: async () =>
        baseMission({
          status: missionStatus,
          ownerAuths: createdAuths.map((a) => ({
            ...a,
            status: a.status,
            revokedAt: null,
          })),
        }),
      findUniqueOrThrow: async () => ({
        id: "m1",
        tenantId: "ten1",
        status: missionStatus,
        blockedReason: null,
      }),
      update: async ({ data }: { data: { status: string } }) => {
        missionStatus = data.status;
        return { id: "m1", tenantId: "ten1", status: missionStatus, blockedReason: null };
      },
    },
    ownerAuthorization: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "auth1", ...data };
        createdAuths.push(row);
        opts.onCreateAuth?.(data);
        return row;
      },
    },
    approvalRoutingPolicy: {
      findMany: async () => [],
    },
    approvalRequest: {
      create: async () => ({ id: "apr1" }),
    },
    authorizationToken: {
      create: async () => ({ id: "tok1" }),
    },
  };

  const audit = { append: async () => undefined };

  const mail = {
    name: "mock",
    send: async () => ({ id: "m", provider: "mock", isMock: true }),
  };

  const svc = new MissionsService(
    prisma as never,
    audit as never,
    {} as never,
    signatures,
    {} as never,
    {} as never,
    {} as never,
    mail as never,
  );

  return { svc, providerCalls, createdAuths, getStatus: () => missionStatus };
}

describe("attachExistingOwnerAuth", () => {
  it("signed envelope → OwnerAuthorization valid, no createEnvelope", async () => {
    const { svc, providerCalls, createdAuths } = makeService({
      getStatus: async () => "signed",
    });

    const mission = await svc.attachExistingOwnerAuth("m1", user, {
      signatureEnvelopeId: "244",
      signerLabel: "Gab",
    });

    assert.ok(mission);
    assert.equal(createdAuths.length, 1);
    const auth = createdAuths[0]!;
    assert.equal(auth.signatureEnvelopeId, "244");
    assert.equal(auth.status, "valid");
    assert.equal(auth.isStubSignature, false);
    assert.equal(auth.scopeHash, "hash-abc");
    assert.equal(auth.signatureProvider, "pragma-sign");
    assert.equal(auth.signatureStatus, "signed");

    assert.ok(providerCalls.some((c) => c === "getStatus:244"));
    assert.ok(!providerCalls.includes("createEnvelope"));
    assert.ok(!providerCalls.some((c) => c.includes("request")));
  });

  it("pending envelope → fail-closed, no OwnerAuthorization", async () => {
    const { svc, createdAuths, providerCalls } = makeService({
      getStatus: async () => "pending",
    });

    await assert.rejects(
      () =>
        svc.attachExistingOwnerAuth("m1", user, {
          signatureEnvelopeId: "244",
        }),
      (e: unknown) =>
        e instanceof BadRequestException &&
        String((e as BadRequestException).message).includes("non signée"),
    );
    assert.equal(createdAuths.length, 0);
    assert.ok(!providerCalls.includes("createEnvelope"));
  });

  it("missing envelope (getStatus throws) → fail-closed", async () => {
    const { svc, createdAuths, providerCalls } = makeService({
      getStatus: async () => {
        throw new Error("HTTP 404");
      },
    });

    await assert.rejects(
      () =>
        svc.attachExistingOwnerAuth("m1", user, {
          signatureEnvelopeId: "999",
        }),
      BadRequestException,
    );
    assert.equal(createdAuths.length, 0);
    assert.ok(!providerCalls.includes("createEnvelope"));
  });

  it("never invokes partner createEnvelope even when signed", async () => {
    let createCalled = false;
    const { svc } = makeService({
      getStatus: async () => "signed",
      onCreateEnvelope: () => {
        createCalled = true;
      },
    });
    await svc.attachExistingOwnerAuth("m1", user, {
      signatureEnvelopeId: "244",
    });
    assert.equal(createCalled, false);
  });

  it("missing signatureEnvelopeId → BadRequest", async () => {
    const { svc, createdAuths } = makeService({
      getStatus: async () => "signed",
    });
    await assert.rejects(
      () => svc.attachExistingOwnerAuth("m1", user, {}),
      (e: unknown) =>
        e instanceof BadRequestException &&
        String((e as BadRequestException).message).includes(
          "signatureEnvelopeId",
        ),
    );
    assert.equal(createdAuths.length, 0);
  });
});
