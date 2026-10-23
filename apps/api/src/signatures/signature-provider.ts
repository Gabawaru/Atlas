/**
 * SignatureProvider pluggable — hypothèse workflow-approbation.md §6.
 * Aucun prestataire e-sign réel requis au MVP ; mock fourni.
 * Circuit deux parties : propriétaire + contrepartie A.
 * L'IA n'appelle jamais createEnvelope sans action humaine.
 */

export type SignatureStatus = "pending" | "signed" | "declined" | "expired";

export interface SignatureSigner {
  email: string;
  name: string;
  role: "owner" | "counterparty";
}

export interface CreateEnvelopeResult {
  envelopeId: string;
  provider: string;
  status: SignatureStatus;
}

export interface SignatureArtifact {
  artifactRef: string;
  contentHash: string;
  /** true = mock / stub — pas une preuve eIDAS */
  isMock: boolean;
  signedBy: string[];
}

export interface SignatureProvider {
  readonly name: string;
  createEnvelope(
    documentHash: string,
    signers: SignatureSigner[],
  ): Promise<CreateEnvelopeResult>;
  /** Enregistre la signature d'une partie ; passe à signed quand toutes ont signé */
  completeSigner(
    envelopeId: string,
    signerEmail: string,
  ): Promise<SignatureStatus>;
  getStatus(envelopeId: string): Promise<SignatureStatus>;
  fetchArtifact(envelopeId: string): Promise<SignatureArtifact>;
}

export const SIGNATURE_PROVIDER = Symbol("SIGNATURE_PROVIDER");
