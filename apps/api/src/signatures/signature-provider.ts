/**
 * SignatureProvider pluggable — hypothèse workflow-approbation.md §6.
 * Aucun prestataire e-sign réel requis au MVP ; mock fourni.
 * L'IA n'appelle jamais createEnvelope sans action humaine owner.
 */

export type SignatureStatus = "pending" | "signed" | "declined" | "expired";

export interface SignatureSigner {
  email: string;
  name: string;
}

export interface CreateEnvelopeResult {
  envelopeId: string;
  provider: string;
}

export interface SignatureArtifact {
  artifactRef: string;
  contentHash: string;
  /** true = mock / stub — pas une preuve eIDAS */
  isMock: boolean;
}

export interface SignatureProvider {
  readonly name: string;
  createEnvelope(
    documentHash: string,
    signers: SignatureSigner[],
  ): Promise<CreateEnvelopeResult>;
  getStatus(envelopeId: string): Promise<SignatureStatus>;
  fetchArtifact(envelopeId: string): Promise<SignatureArtifact>;
}

export const SIGNATURE_PROVIDER = Symbol("SIGNATURE_PROVIDER");
