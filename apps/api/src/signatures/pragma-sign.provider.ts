/**
 * SignatureProvider backed by Pragma Sign partner API.
 * Requires PRAGMA_SIGN_API_KEY (env) — never hardcode.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  isAllowedSignPurpose,
  isPurposeEnforceEnabled,
} from "../retention/retention.policy";
import {
  mapPragmaStatusToAuthz,
  mapPragmaStatusToSignatureStatus,
  PragmaSignClient,
  type FetchLike,
  type PragmaSignApiStatus,
} from "./pragma-sign.client";
import type {
  CreateEnvelopeResult,
  SignatureArtifact,
  SignatureProvider,
  SignatureSigner,
  SignatureStatus,
  SignedAuthorizationRequest,
  SignedAuthorizationResult,
} from "./signature-provider";

export type PragmaSignProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  client?: PragmaSignClient;
};

type LocalEnvelope = {
  documentHash: string;
  signers: SignatureSigner[];
  pragmaId: string;
  signUrl?: string;
};

/**
 * Real signed-authz path. createEnvelope opens a Pragma Sign envelope for the
 * primary owner signer; status is polled from the API (external human sign).
 */
export class PragmaSignSignatureProvider implements SignatureProvider {
  readonly name = "pragma-sign";

  private readonly client: PragmaSignClient;
  /** Local mirror of opened envelopes (id → meta). */
  private readonly local = new Map<string, LocalEnvelope>();
  /** Chat/mission sign() tracking by documentHash. */
  private readonly authzByHash = new Map<string, string>();

  constructor(opts: PragmaSignProviderOptions) {
    this.client =
      opts.client ??
      new PragmaSignClient({
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
        fetchImpl: opts.fetchImpl,
      });
  }

  async createEnvelope(
    documentHash: string,
    signers: SignatureSigner[],
  ): Promise<CreateEnvelopeResult> {
    if (signers.length < 1) {
      throw new Error("Pragma Sign : au moins un signataire requis.");
    }
    const owner =
      signers.find((s) => s.role === "owner") ?? signers[0]!;
    const title = `Atlas autorisation ${documentHash.slice(0, 12)}`;
    const bodyHtml =
      `<h1>Autorisation pentest Atlas</h1>` +
      `<p>Empreinte document : <code>${escapeHtml(documentHash)}</code></p>` +
      `<p>Signataire : ${escapeHtml(owner.name)} &lt;${escapeHtml(owner.email)}&gt;</p>`;

    const doc = await this.client.createDocument(title, bodyHtml);
    const req = await this.client.requestSignature({
      docId: doc.id,
      signerEmail: owner.email,
      signerName: owner.name,
    });
    const envelopeId = String(req.id);
    this.local.set(envelopeId, {
      documentHash,
      signers,
      pragmaId: envelopeId,
      signUrl: req.sign_url,
    });
    return {
      envelopeId,
      provider: this.name,
      status: mapPragmaStatusToSignatureStatus(req.status),
    };
  }

  /**
   * Signing happens on Pragma Sign (email link). This method re-polls status;
   * it does not forge a local complete.
   */
  async completeSigner(
    envelopeId: string,
    _signerEmail: string,
  ): Promise<SignatureStatus> {
    return this.getStatus(envelopeId);
  }

  async getStatus(envelopeId: string): Promise<SignatureStatus> {
    const apiStatus = await this.client.getSignatureStatus(envelopeId);
    return mapPragmaStatusToSignatureStatus(apiStatus);
  }

  async fetchArtifact(envelopeId: string): Promise<SignatureArtifact> {
    const env = await this.client.getEnvelope(envelopeId);
    const apiStatus = env.signature.status;
    const local = this.local.get(envelopeId);
    const signedBy =
      apiStatus === "signed" && env.signature.signer_email
        ? [String(env.signature.signer_email)]
        : [];
    const payload = JSON.stringify({
      envelopeId,
      documentHash: local?.documentHash,
      status: apiStatus,
      provider: this.name,
    });
    return {
      artifactRef: `pragma-sign://signature/${envelopeId}/pdf`,
      contentHash: createHash("sha256").update(payload).digest("hex"),
      isMock: false,
      signedBy,
    };
  }

  /**
   * Chat / purpose gate: open or re-poll a Pragma Sign envelope for documentHash.
   */
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
        requestId: `pragma-authz-purpose-${randomUUID()}`,
        isMock: false,
      };
    }

    let envelopeId = this.authzByHash.get(request.documentHash);
    if (!envelopeId) {
      const title = `Atlas authz ${request.purpose ?? "sign"} ${request.documentHash.slice(0, 12)}`;
      const bodyHtml =
        `<h1>Autorisation Atlas</h1>` +
        `<p>Purpose: ${escapeHtml(String(request.purpose ?? "sign"))}</p>` +
        `<p>Hash: <code>${escapeHtml(request.documentHash)}</code></p>`;
      const doc = await this.client.createDocument(title, bodyHtml);
      const signerEmail =
        process.env.ATLAS_PRAGMA_SIGNER_EMAIL?.trim() ||
        "ben@pragma.mc";
      const signerName =
        process.env.ATLAS_PRAGMA_SIGNER_NAME?.trim() || "Autorité Pragma";
      const req = await this.client.requestSignature({
        docId: doc.id,
        signerEmail,
        signerName,
      });
      envelopeId = String(req.id);
      this.authzByHash.set(request.documentHash, envelopeId);
      return {
        status: mapPragmaStatusToAuthz(req.status),
        provider: this.name,
        requestId: envelopeId,
        isMock: false,
      };
    }

    const apiStatus: PragmaSignApiStatus =
      await this.client.getSignatureStatus(envelopeId);
    return {
      status: mapPragmaStatusToAuthz(apiStatus),
      provider: this.name,
      requestId: envelopeId,
      isMock: false,
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
