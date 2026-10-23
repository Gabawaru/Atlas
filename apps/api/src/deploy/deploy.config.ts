import { DEPLOY_MODES, type DeployMode } from "@atlas/shared";

export type Connectivity = "online" | "offline";

export interface DeployRuntime {
  mode: DeployMode;
  connectivity: Connectivity;
  /** Où tourne le contrôle plane (doc runtime) */
  controlPlane: "cloud_a" | "on_prem";
  /** Où tourne le worker d'exécution */
  worker: "cloud_a" | "on_prem" | "same_host";
  offline: boolean;
}

export interface ComponentMapRow {
  component: string;
  hosted: string;
  hybrid: string;
  local: string;
}

/** Matrice « ce qui tourne où » — source de vérité docs + API */
export const DEPLOY_COMPONENT_MAP: ComponentMapRow[] = [
  {
    component: "Identité / abonnement",
    hosted: "Cloud A",
    hybrid: "Cloud A",
    local: "Appliance client",
  },
  {
    component: "Approbations A",
    hosted: "Cloud A",
    hybrid: "Cloud A (online) ; jetons pré-téléchargés si offline",
    local: "Locale (stub/config) — pas de hiérarchie A réelle inventée",
  },
  {
    component: "Policy Guard + jetons",
    hosted: "Cloud A",
    hybrid: "Émis cloud ; évalués aussi on-prem",
    local: "Locaux",
  },
  {
    component: "Worker contrôles passifs",
    hosted: "Cloud A (sandbox)",
    hybrid: "On-prem / VPC client",
    local: "Même hôte / LAN",
  },
  {
    component: "Preuves / audit",
    hosted: "Cloud A",
    hybrid: "Local puis sync différentielle",
    local: "Local ; sync optionnelle au retour",
  },
  {
    component: "Assistant LLM",
    hosted: "API/mock cloud",
    hybrid: "API cloud si online ; sinon mock/plafond",
    local: "Mock / self-host (hors MVP)",
  },
];

export function resolveDeployMode(
  raw = process.env.ATLAS_DEPLOY_MODE,
): DeployMode {
  const m = (raw ?? "hosted").toLowerCase();
  if ((DEPLOY_MODES as readonly string[]).includes(m)) {
    return m as DeployMode;
  }
  return "hosted";
}

export function resolveConnectivity(
  offlineFlag = process.env.ATLAS_OFFLINE,
): Connectivity {
  return offlineFlag === "true" || offlineFlag === "1" ? "offline" : "online";
}

export function getDeployRuntime(
  env: NodeJS.ProcessEnv = process.env,
): DeployRuntime {
  const mode = resolveDeployMode(env.ATLAS_DEPLOY_MODE);
  const connectivity = resolveConnectivity(env.ATLAS_OFFLINE);
  const offline = connectivity === "offline";

  if (mode === "hosted") {
    return {
      mode,
      connectivity,
      controlPlane: "cloud_a",
      worker: "cloud_a",
      offline,
    };
  }
  if (mode === "hybrid") {
    return {
      mode,
      connectivity,
      controlPlane: "cloud_a",
      worker: "on_prem",
      offline,
    };
  }
  return {
    mode: "local",
    connectivity,
    controlPlane: "on_prem",
    worker: "same_host",
    offline,
  };
}

/**
 * Hébergé offline : pas d'exécution (contrôle plane injoignable).
 * Hybride/local offline : exécution seulement si jeton local pré-matériel valide.
 */
export function canExecuteOffline(runtime: DeployRuntime, hasValidLocalToken: boolean): {
  allow: boolean;
  code: string;
  reason: string;
} {
  if (!runtime.offline) {
    return { allow: true, code: "ONLINE", reason: "Connectivité online" };
  }
  if (runtime.mode === "hosted") {
    return {
      allow: false,
      code: "OFFLINE_HOSTED",
      reason:
        "Mode hébergé offline : le contrôle plane cloud est injoignable — aucune exécution. Pas de contournement IA.",
    };
  }
  if (!hasValidLocalToken) {
    return {
      allow: false,
      code: "OFFLINE_NO_TOKEN",
      reason:
        "Offline (hybride/local) : aucun jeton local pré-matériel valide — blocage déterministe.",
    };
  }
  return {
    allow: true,
    code: "OFFLINE_LOCAL_TOKEN",
    reason:
      "Offline hybride/local avec jeton local valide — exécution bornée ; sync journaux au retour.",
  };
}

/**
 * Interdit de prétendre qu'une révocation distante est effective immédiatement offline.
 */
export function remoteRevokeWhileOffline(runtime: DeployRuntime): {
  remoteConfirmed: false;
  mustQueue: boolean;
  message: string;
} {
  if (!runtime.offline) {
    return {
      remoteConfirmed: false,
      mustQueue: false,
      message: "Online — la révocation locale du contrôle plane s'applique tout de suite.",
    };
  }
  return {
    remoteConfirmed: false,
    mustQueue: true,
    message:
      "Offline : pas de fausse révocation distante instantanée. L'intention est journalisée (pending_sync) et appliquée / confirmée au retour online.",
  };
}
