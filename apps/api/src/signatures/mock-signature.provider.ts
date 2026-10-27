import { createHash, randomUUID } from "node:crypto";
import type {
  CreateEnvelopeResult,
  SignatureArtifact,
  SignatureProvider,
  SignatureSigner,
  SignatureStatus,
  SignedAuthorizationRequest,
  SignedAuthorizationResult,
  SignedAuthorizationStatus,
} from "./signature-provider";

function resolveStubOutcome(
  request?: SignedAuthorizationRequest,
): SignedAuthorizationStatus {
  const fromReq = request?.stubOutcome;
  if (fromReq === "signed" || fromReq === "pending" || fromReq === "rejected") {
    return fromReq;
  }
  const env = (process.env.ATLAS_CHAT_SIGNATURE_STUB ?? "").toLowerCase().trim();
  if (env === "signed" || env === "pending" || env === "rejected") {
    return env;
  }
  // Défaut démo-safe sans API externe : pending (gate chat bloque)
  return "pending";
}

/**
 * Mock pluggable — circuit à deux parties (owner + contrepartie).
 * Ne constitue PAS une signature électronique réelle ni eIDAS / Pragma Sign.
 */
export class MockSignatureProvider implements SignatureProvider {
  readonly name = "mock";

  private envelopes = new Map<
    string,
    {
      documentHash: string;
      signers: SignatureSigner[];
      completed: Set<string>;
      status: SignatureStatus;
    }
  >();

  async createEnvelope(
    documentHash: string,
    signers: SignatureSigner[],
  ): Promise<CreateEnvelopeResult> {
    if (signers.length < 2) {
      throw new Error(
        "Circuit mock : deux parties requises (propriétaire + contrepartie A).",
      );
    }
    const envelopeId = `mock-env-${randomUUID()}`;
    this.envelopes.set(envelopeId, {
      documentHash,
      signers,
      completed: new Set(),
      status: "pending",
    });
    return { envelopeId, provider: this.name, status: "pending" };
  }

  async completeSigner(
    envelopeId: string,
    signerEmail: string,
  ): Promise<SignatureStatus> {
    const env = this.envelopes.get(envelopeId);
    if (!env) return "expired";
    const email = signerEmail.toLowerCase();
    const ok = env.signers.some((s) => s.email.toLowerCase() === email);
    if (!ok) {
      throw new Error(`Signataire hors enveloppe mock: ${signerEmail}`);
    }
    env.completed.add(email);
    if (env.completed.size >= env.signers.length) {
      env.status = "signed";
    }
    return env.status;
  }

  async getStatus(envelopeId: string): Promise<SignatureStatus> {
    const env = this.envelopes.get(envelopeId);
    if (!env) return "expired";
    return env.status;
  }

  async fetchArtifact(envelopeId: string): Promise<SignatureArtifact> {
    const env = this.envelopes.get(envelopeId);
    if (!env) {
      throw new Error(`Enveloppe mock inconnue: ${envelopeId}`);
    }
    const signedBy = [...env.completed];
    const payload = JSON.stringify({
      envelopeId,
      documentHash: env.documentHash,
      signers: env.signers,
      signedBy,
      status: env.status,
      mock: true,
      disclaimer: "Signature mock — pas un prestataire e-sign réel",
    });
    return {
      artifactRef: `mock://artifact/${envelopeId}`,
      contentHash: createHash("sha256").update(payload).digest("hex"),
      isMock: true,
      signedBy,
    };
  }

  /**
   * Gate signed-authorization (chat). Pas d'appel réseau — stub local.
   * Missions continuent d'utiliser createEnvelope / completeSigner.
   */
  async sign(
    request: SignedAuthorizationRequest,
  ): Promise<SignedAuthorizationResult> {
    const status = resolveStubOutcome(request);
    const requestId = `mock-authz-${randomUUID()}`;
    return {
      status,
      provider: this.name,
      requestId,
      isMock: true,
    };
  }
}
