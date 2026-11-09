/** Gate UX Scanner — n'autorise pas l'exécution ; Policy Guard reste la source de vérité. */

export type ScannerReadinessInput = {
  authenticated: boolean;
  selectedNeedId: string;
  assetCount: number;
  webConnectorActive: boolean;
};

export type ScannerReadiness = {
  ready: boolean;
  /** Motif affiché quand le CTA est désactivé (français, actionnable). */
  blockReason: string | null;
};

const EXECUTABLE_NEED = "web_presence";

/**
 * Décide si le CTA Scanner peut lancer le parcours démo autorisé.
 * Ordre : auth → besoin exécutable → cible → connecteur (prérequis Policy Guard).
 */
export function evaluateScannerReadiness(
  input: ScannerReadinessInput,
): ScannerReadiness {
  if (!input.authenticated) {
    return { ready: false, blockReason: "Connexion requise." };
  }
  if (input.selectedNeedId !== EXECUTABLE_NEED) {
    return { ready: false, blockReason: "Besoin non executable." };
  }
  if (input.assetCount < 1) {
    return { ready: false, blockReason: "FQDN requis." };
  }
  if (!input.webConnectorActive) {
    return { ready: false, blockReason: "Connecteur inactif — reconnexion…" };
  }
  return { ready: true, blockReason: null };
}

export { EXECUTABLE_NEED };
