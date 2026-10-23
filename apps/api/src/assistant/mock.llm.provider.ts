import { CONNECTOR_CATALOG } from "../connectors/connector.types";
import { UX_NEEDS } from "@atlas/shared";
import type { LlmProvider, LlmTurnRequest, LlmTurnResult } from "./llm.types";

/**
 * Provider mock déterministe (mots-clés) — défaut MVP.
 * Aucun appel réseau ; tokens estimés proportionnels à la longueur.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock" as const;

  async complete(req: LlmTurnRequest): Promise<LlmTurnResult> {
    const lower = req.message.toLowerCase();
    const promptTokens = Math.max(8, Math.ceil(req.message.length / 4));

    let intent = "general";
    let reply =
      "Je guide vers les modules et connecteurs disponibles. Je n'exécute rien : Policy Guard + autorisations humaines décident.";
    let recommendedConnectors: string[] = [];
    let recommendedNeed: string | null = null;
    let canExecuteHint = false;
    /** Même si un prompt demande « lance », le mock peut signaler — le service refuse. */
    let requestedExecution = false;

    if (
      lower.includes("web") ||
      lower.includes("internet") ||
      lower.includes("dns") ||
      lower.includes("présence") ||
      lower.includes("presence")
    ) {
      intent = "web_presence";
      recommendedNeed = "web_presence";
      recommendedConnectors = ["web.passive.presence"];
      canExecuteHint = true;
      reply =
        "Besoin « présence web » : connectez le connecteur « Présence web passive », liez des actifs du scope, obtenez les autorisations, puis lancez une mission. L'abonnement seul ne suffit pas ; je ne contourne pas le Policy Guard.";
    } else if (
      lower.includes("github") ||
      lower.includes("git") ||
      lower.includes("logiciel") ||
      lower.includes("code")
    ) {
      intent = "systems_software";
      recommendedNeed = "systems_software";
      recommendedConnectors = ["github.read_only"];
      reply =
        "Pour le code / logiciels : un stub GitHub lecture seule (mock OAuth) existe — clairement non production. Il n'autorise aucune exécution de contrôle. Pas de faux « terminé ».";
    } else if (
      lower.includes("réseau") ||
      lower.includes("reseau") ||
      lower.includes("network") ||
      lower.includes("interne")
    ) {
      intent = "internal_network";
      recommendedNeed = "internal_network";
      reply =
        "Réseau interne : non branché dans ce MVP (aucun module). Je ne peux pas lancer de scan. Statut honnête : « non branché ».";
    } else if (
      lower.includes("config") ||
      lower.includes("iam") ||
      lower.includes("accès") ||
      lower.includes("acces")
    ) {
      intent = "configs_access";
      recommendedNeed = "configs_access";
      reply =
        "Configs / accès : non branché. Aucun connecteur IAM. Je refuse d'inventer une capacité.";
    } else if (
      lower.includes("vuln") ||
      lower.includes("cve") ||
      lower.includes("corriger") ||
      lower.includes("osv") ||
      lower.includes("kev")
    ) {
      intent = "vuln_tracking";
      recommendedNeed = "vuln_tracking";
      reply =
        "Vulnérabilités : matching passif OSV/NVD/KEV + remédiation locale. Confiance ≠ gravité. Pas d'exécution automatique depuis cette conversation.";
    } else if (
      lower.includes("exécuter") ||
      lower.includes("executer") ||
      lower.includes("lance") ||
      lower.includes("scan") ||
      lower.includes("bypass") ||
      lower.includes("ignore policy")
    ) {
      intent = "execute_request";
      requestedExecution = true;
      reply =
        "Je ne lance pas d'exécution. Passez par une mission autorisée ; le Policy Guard refuse sans owner auth, approbation A (si réelle), jeton, scope et connecteur actif.";
    }

    const completionTokens = Math.max(16, Math.ceil(reply.length / 4));
    void UX_NEEDS;
    void CONNECTOR_CATALOG;

    return {
      reply,
      intent,
      recommendedNeed,
      recommendedConnectors,
      canExecuteHint,
      provider: "mock",
      model: "atlas-mock-keywords-v1",
      promptTokens,
      completionTokens,
      requestedExecution,
    };
  }
}
