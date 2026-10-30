/**
 * issueToken — staff approver without tenantId uses mission.tenantId.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { MissionsService } from "./missions.service";
import type { AuthUser } from "../auth/auth.types";

const staffApprover: AuthUser = {
  userId: "approver-1",
  email: "approver@a.atlas.local",
  displayName: "Alex Approver",
  // no tenantId — staff membership only
  staffRoles: ["approver"],
  orgId: "org-a",
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

function makeIssueTokenService(opts?: { missionExists?: boolean }) {
  const missionExists = opts?.missionExists ?? true;
  const createdTokens: Record<string, unknown>[] = [];
  const auditActions: string[] = [];

  const prisma = {
    mission: {
      findUnique: async ({
        where,
      }: {
        where: { id: string };
        select?: { tenantId: true };
      }) => {
        if (!missionExists || where.id !== "m1") return null;
        return { tenantId: "ten1" };
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; tenantId: string };
      }) => {
        if (!missionExists || where.id !== "m1" || where.tenantId !== "ten1") {
          return null;
        }
        return {
          id: "m1",
          tenantId: "ten1",
          status: "A_APPROVED",
          moduleIds: ["web.passive.presence.v1"],
          scopeVersions: [scope],
          ownerAuths: [],
          approvalReqs: [],
          tokens: [],
          jobRuns: [],
          findings: [],
          reports: [],
        };
      },
    },
    authorizationToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: "tok1", ...data };
        createdTokens.push(row);
        return row;
      },
    },
  };

  const audit = {
    append: async (e: { action: string }) => {
      auditActions.push(e.action);
    },
  };

  const svc = new MissionsService(
    prisma as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { svc, createdTokens, auditActions };
}

describe("issueToken", () => {
  it("staff without tenantId issues token via mission.tenantId", async () => {
    const { svc, createdTokens, auditActions } = makeIssueTokenService();

    const token = await svc.issueToken("m1", staffApprover);

    assert.equal(token.id, "tok1");
    assert.equal(createdTokens.length, 1);
    assert.equal(createdTokens[0]!.missionId, "m1");
    assert.equal(createdTokens[0]!.scopeHash, "hash-abc");
    assert.ok(auditActions.includes("authorization_token.issued"));
  });

  it("staff without tenantId + missing mission → clear fail-closed error", async () => {
    const { svc, createdTokens } = makeIssueTokenService({
      missionExists: false,
    });

    await assert.rejects(
      () => svc.issueToken("missing", staffApprover),
      (e: unknown) =>
        e instanceof BadRequestException &&
        String((e as BadRequestException).message).includes("tenant requis"),
    );
    assert.equal(createdTokens.length, 0);
  });
});
