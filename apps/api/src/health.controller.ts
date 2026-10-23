import { Controller, Get } from "@nestjs/common";
import { getDeployRuntime } from "./deploy/deploy.config";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    const deploy = getDeployRuntime();
    return {
      ok: true,
      service: "atlas-api",
      version: "0.1.0-mvp",
      deploy: {
        mode: deploy.mode,
        connectivity: deploy.connectivity,
        controlPlane: deploy.controlPlane,
        worker: deploy.worker,
      },
      notes: [
        "Abonnement ≠ autorisation pentest",
        "Approbation A ≠ autorisation propriétaire",
        "IA hors chemin d'exécution",
        "Offline : pas de fausse révocation distante instantanée",
      ],
    };
  }
}
