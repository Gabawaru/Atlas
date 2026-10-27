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
    return {
      ready: false,
      blockReason: "Connexion requise — le Scanner n'exécute rien sans session.",
    };
  }
  if (input.selectedNeedId !== EXECUTABLE_NEED) {
    return {
      ready: false,
      blockReason:
        "Besoin non exécutable — seule « présence web » passe le Policy Guard en démo.",
    };
  }
  if (input.assetCount < 1) {
    return {
      ready: false,
      blockReason:
        "Aucune cible (actif) — ajoutez un actif in-scope ou utilisez le seed démo.",
    };
  }
  if (!input.webConnectorActive) {
    return {
      ready: false,
      blockReason:
        "Connecteur « présence web » inactif — connectez-le (options avancées) ; sans lui Policy Guard refuse.",
    };
  }
  return { ready: true, blockReason: null };
}

export { EXECUTABLE_NEED };
