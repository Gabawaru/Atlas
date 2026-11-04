/**
 * SignatureProvider backed by Cultivation Paradise in-session drawn signatures.
 * Requires ATLAS_PARADISE_AUTHZ_SECRET. No PRAGMA_SIGN_API_KEY.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  isAllowedSignPurpose,
  isPurposeEnforceEnabled,
} from "../retention/retention.policy";
import {
  artifactRefForAttestation,
  isParadiseEnvelopeId,
  mintParadiseAttestation,
  PARADISE_ENVELOPE_PREFIX,
  PARADISE_PROVIDER_NAME,
  verifyParadiseAttestation,
  type ParadiseAttestationPayload,
  type ParadisePerson,
} from "./paradise-authz";
import {
  ParadiseSignClient,
  type FetchLike,
} from "./paradise-sign.client";
import type {
  CreateEnvelopeResult,
  SignatureArtifact,
  SignatureProvider,
  SignatureSigner,
  SignatureStatus,
  SignedAuthorizationRequest,
  SignedAuthorizationResult,
} from "./signature-provider";

export type ParadiseSignProviderOptions = {
  secret: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  client?: ParadiseSignClient;
  /** Inject clock for tests (unix seconds). */
  nowSec?: () => number;
};

type CachedEnvelope = {
  documentHash: string;
  signers: SignatureSigner[];
  status: SignatureStatus;
  payload?: ParadiseAttestationPayload;
  attestationToken?: string;
  drawUrl?: string;
  person?: ParadisePerson;
};

/**
 * Real (non-mock) owner-authz path for P0: Paradise PIN session + drawn signature.
 * ingestAttestation verifies HMAC; getStatus may also poll Paradise HTTP.
 */
export class ParadiseSignSignatureProvider implements SignatureProvider {
  readonly name = PARADISE_PROVIDER_NAME;

  private readonly secret: string;
  private readonly client: ParadiseSignClient;
  private readonly nowSec: () => number;
  private readonly local = new Map<string, CachedEnvelope>();
  private readonly authzByHash = new Map<string, string>();

  constructor(opts: ParadiseSignProviderOptions) {
    this.secret = opts.secret.trim();
    if (!this.secret) {
      throw new Error("ATLAS_PARADISE_AUTHZ_SECRET manquante");
    }
    this.client =
      opts.client ??
      new ParadiseSignClient({
        secret: this.secret,
        baseUrl: opts.baseUrl,
        fetchImpl: opts.fetchImpl,
      });
    this.nowSec = opts.nowSec ?? (() => Math.floor(Date.now() / 1000));
  }

  /**
   * Import a Paradise-issued compact attestation (after human drew + confirmed).
   * Stores envelope locally so getStatus/fetchArtifact work offline.
   */
  ingestAttestation(token: string): {
    envelopeId: string;
    status: SignatureStatus;
    payload: ParadiseAttestationPayload;
  } {
    const verified = verifyParadiseAttestation(token, this.secret, {
      nowSec: this.nowSec(),
    });
    if (!verified.ok) {
      throw new Error(`Attestation Paradise refusée: ${verified.reason}`);
    }
    const { payload } = verified;
    if (payload.status !== "signed") {
      throw new Error(
        `Attestation Paradise non signée (status=${payload.status})`,
      );
    }
    this.local.set(payload.envelopeId, {
      documentHash: payload.documentHash ?? "",
      signers: [
        {
          email: payload.signerEmail,
          name: payload.signerName,
          role: "owner",
        },
      ],
      status: "signed",
      payload,
      attestationToken: token.trim(),
      person: payload.person,
    });
    return {
      envelopeId: payload.envelopeId,
      status: "signed",
      payload,
    };
  }

  async createEnvelope(
    documentHash: string,
    signers: SignatureSigner[],
  ): Promise<CreateEnvelopeResult> {
    if (signers.length < 1) {
      throw new Error("Paradise Sign : au moins un signataire requis.");
    }
    const owner = signers.find((s) => s.role === "owner") ?? signers[0]!;

    // Prefer live Paradise session open; fall back to local pending id.
    try {
      const remote = await this.client.createAuthz({
        documentHash,
        signerLabel: owner.name,
        purpose: "atlas-owner-authz",
      });
      const envelopeId = remote.id?.trim();
      if (!envelopeId || !isParadiseEnvelopeId(envelopeId)) {
        throw new Error("Paradise create: envelopeId invalide");
      }
      this.local.set(envelopeId, {
        documentHash,
        signers,
        status: mapRemoteStatus(remote.status),
        drawUrl: remote.drawUrl,
        person: remote.person,
      });
      if (remote.attestation && remote.status === "signed") {
        this.ingestAttestation(remote.attestation);
      }
      return {
        envelopeId,
        provider: this.name,
        status: mapRemoteStatus(remote.status),
      };
    } catch {
      const envelopeId = `${PARADISE_ENVELOPE_PREFIX}${randomUUID()}`;
      this.local.set(envelopeId, {
        documentHash,
        signers,
        status: "pending",
      });
      return {
        envelopeId,
        provider: this.name,
        status: "pending",
      };
    }
  }

  /**
   * Drawing happens on Paradise UI. Re-poll remote / local cache.
   * Does not forge completion without attestation or remote signed status.
   */
  async completeSigner(
    envelopeId: string,
    _signerEmail: string,
  ): Promise<SignatureStatus> {
    return this.getStatus(envelopeId);
  }

  async getStatus(envelopeId: string): Promise<SignatureStatus> {
    const cached = this.local.get(envelopeId);
    if (cached?.status === "signed" && cached.attestationToken) {
      return "signed";
    }

    try {
      const remote = await this.client.getAuthz(envelopeId);
      const status = mapRemoteStatus(remote.status);
      if (remote.attestation && status === "signed") {
        this.ingestAttestation(remote.attestation);
        return "signed";
      }
      const prev = this.local.get(envelopeId);
      this.local.set(envelopeId, {
        documentHash: prev?.documentHash ?? remote.documentHash ?? "",
        signers: prev?.signers ?? [
          {
            email: remote.signerEmail,
            name: remote.signerName,
            role: "owner",
          },
        ],
        status,
        drawUrl: remote.drawUrl,
        person: remote.person,
      });
      return status;
    } catch {
      if (cached) return cached.status;
      throw new Error(`Enveloppe Paradise introuvable: ${envelopeId}`);
    }
  }

  async fetchArtifact(envelopeId: string): Promise<SignatureArtifact> {
    const status = await this.getStatus(envelopeId);
    const cached = this.local.get(envelopeId);
    if (status !== "signed" || !cached?.attestationToken || !cached.payload) {
      throw new Error(
        `Artifact Paradise indisponible (status=${status}) pour ${envelopeId}`,
      );
    }
    const payload = cached.payload;
    const body = JSON.stringify({
      envelopeId,
      provider: this.name,
      person: payload.person,
      signerEmail: payload.signerEmail,
      signatureStrokeHash: payload.signatureStrokeHash,
      documentHash: payload.documentHash,
    });
    return {
      artifactRef: artifactRefForAttestation(cached.attestationToken),
      contentHash: createHash("sha256").update(body).digest("hex"),
      isMock: false,
      signedBy: [payload.signerEmail],
    };
  }

  async sign(
    request: SignedAuthorizationRequest,
  ): Promise<SignedAuthorizationResult> {
    if (
      isPurposeEnforceEnabled() &&
      !isAllowedSignPurpose(request.purpose)
    ) {
      return {
        status: "rejected",
        provider: this.name,
        requestId: `paradise-authz-purpose-${randomUUID()}`,
        isMock: false,
      };
    }

    let envelopeId = this.authzByHash.get(request.documentHash);
    if (!envelopeId) {
      const created = await this.createEnvelope(request.documentHash, [
        {
          email:
            process.env.ATLAS_PRAGMA_SIGNER_EMAIL?.trim() || "ben@pragma.mc",
          name:
            process.env.ATLAS_PRAGMA_SIGNER_NAME?.trim() ||
            "Benjamin Mathias Louange",
          role: "owner",
        },
      ]);
      envelopeId = created.envelopeId;
      this.authzByHash.set(request.documentHash, envelopeId);
      return {
        status: created.status === "signed" ? "signed" : "pending",
        provider: this.name,
        requestId: envelopeId,
        isMock: false,
      };
    }

    const status = await this.getStatus(envelopeId);
    return {
      status: status === "signed" ? "signed" : status === "declined" ? "rejected" : "pending",
      provider: this.name,
      requestId: envelopeId,
      isMock: false,
    };
  }
}

function mapRemoteStatus(
  s: string | undefined,
): SignatureStatus {
  switch (s) {
    case "signed":
      return "signed";
    case "declined":
    case "refused":
      return "declined";
    case "expired":
    case "cancelled":
      return "expired";
    default:
      return "pending";
  }
}

/** Test helper — mint a valid signed attestation for unit tests. */
export function mintTestParadiseAttestation(
  secret: string,
  overrides: Partial<ParadiseAttestationPayload> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: ParadiseAttestationPayload = {
    v: 1,
    iss: "cultivationparadise.com",
    provider: PARADISE_PROVIDER_NAME,
    envelopeId: `${PARADISE_ENVELOPE_PREFIX}test-${randomUUID()}`,
    status: "signed",
    person: "benjamin",
    signerEmail: "ben@pragma.mc",
    signerName: "Benjamin Mathias Louange",
    purpose: "atlas-owner-authz",
    documentHash: "a".repeat(64),
    signatureStrokeHash: "b".repeat(64),
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  return mintParadiseAttestation(payload, secret);
}
