/**
 * SignatureProvider pluggable — hypothèse workflow-approbation.md §6.
 * Runtime:
 * - Paradise drawn signatures when ATLAS_PARADISE_AUTHZ_SECRET is set (P0)
 * - else Pragma Sign when PRAGMA_SIGN_API_KEY is set
 * - else mock (CI / démo)
 * Circuit deux parties (mock) ou enveloppe Paradise / Pragma Sign (owner signer).
 * L'IA n'appelle jamais createEnvelope sans action humaine.
 *
 * signed-authorization (chat) : `sign` → signed | pending | rejected.
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
  /** true = mock / stub — pas une preuve eIDAS / Pragma Sign */
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
   * Mock : pending par défaut ; démo via ATLAS_CHAT_SIGNATURE_STUB ou stubOutcome.
   * Pragma Sign : crée / poll une enveloppe réelle.
   */
  sign(request: SignedAuthorizationRequest): Promise<SignedAuthorizationResult>;
}

export const SIGNATURE_PROVIDER = Symbol("SIGNATURE_PROVIDER");
