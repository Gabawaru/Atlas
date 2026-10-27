/**
 * SignatureProvider pluggable — hypothèse workflow-approbation.md §6.
 * Aucun prestataire e-sign réel requis au MVP ; mock fourni.
 * Circuit deux parties : propriétaire + contrepartie A.
 * L'IA n'appelle jamais createEnvelope sans action humaine.
 *
 * signed-authorization (chat) : `sign` → signed | pending | rejected.
 * Pas de Pragma Sign réel — stub / mock uniquement.
 */

export type SignatureStatus = "pending" | "signed" | "declined" | "expired";

/** Statuts gate chat / autorisation écrite (contrat stub) */
export type SignedAuthorizationStatus = "signed" | "pending" | "rejected";

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

/** Demande d'autorisation signée (document / engagement) — pas d'exécution */
export interface SignedAuthorizationRequest {
  /** Empreinte du document / paquet d'autorisation */
  documentHash: string;
  /** Contexte non sensible */
  purpose?: "chat" | "mission" | string;
  tenantId?: string;
  /**
   * Hook démo / test uniquement — ignoré hors stub mock.
   * Préférer ATLAS_CHAT_SIGNATURE_STUB en runtime.
   */
  stubOutcome?: SignedAuthorizationStatus;
}

export interface SignedAuthorizationResult {
  status: SignedAuthorizationStatus;
  provider: string;
  requestId: string;
  /** true = mock / stub — pas Pragma Sign / eIDAS */
  isMock: boolean;
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
  /**
   * Autorisation signée pour gates (ex. chat LLM).
   * Stub : pending par défaut ; démo via ATLAS_CHAT_SIGNATURE_STUB ou stubOutcome.
   */
  sign(request: SignedAuthorizationRequest): Promise<SignedAuthorizationResult>;
}

export const SIGNATURE_PROVIDER = Symbol("SIGNATURE_PROVIDER");
