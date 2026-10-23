import { createHash, randomUUID } from "node:crypto";
import type {
  CreateEnvelopeResult,
  SignatureArtifact,
  SignatureProvider,
  SignatureSigner,
  SignatureStatus,
} from "./signature-provider";

/**
 * Mock pluggable — enveloppes signées instantanément.
 * Ne constitue PAS une signature électronique réelle ni eIDAS.
 */
export class MockSignatureProvider implements SignatureProvider {
  readonly name = "mock";

  private envelopes = new Map<
    string,
    {
      documentHash: string;
      signers: SignatureSigner[];
      status: SignatureStatus;
    }
  >();

  async createEnvelope(
    documentHash: string,
    signers: SignatureSigner[],
  ): Promise<CreateEnvelopeResult> {
    const envelopeId = `mock-env-${randomUUID()}`;
    this.envelopes.set(envelopeId, {
      documentHash,
      signers,
      status: "signed",
    });
    return { envelopeId, provider: this.name };
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
    const payload = JSON.stringify({
      envelopeId,
      documentHash: env.documentHash,
      signers: env.signers,
      mock: true,
      disclaimer: "Signature mock — pas un prestataire e-sign réel",
    });
    return {
      artifactRef: `mock://artifact/${envelopeId}`,
      contentHash: createHash("sha256").update(payload).digest("hex"),
      isMock: true,
    };
  }
}
