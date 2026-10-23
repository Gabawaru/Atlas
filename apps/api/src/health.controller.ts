import { Controller, Get, Inject, Optional } from "@nestjs/common";
import { getDeployRuntime } from "./deploy/deploy.config";
import { OpsService } from "./ops/ops.service";

@Controller("health")
export class HealthController {
  constructor(
    @Optional() @Inject(OpsService) private readonly ops?: OpsService,
  ) {}

  @Get()
  async health() {
    const deploy = getDeployRuntime();
    let version = "0.1.0-mvp";
    let maintenanceMode = false;
    try {
      if (this.ops) {
        version = await this.ops.currentVersionLabel();
        maintenanceMode = await this.ops.isMaintenanceOn();
      }
    } catch {
      // DB indisponible — fallback hardcodé
    }
    return {
      ok: true,
      service: "atlas-api",
      version,
      maintenanceMode,
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
        maintenanceMode
          ? "Mode maintenance ON — exécutions bloquées (POLICY_DENY)"
          : "Mode maintenance OFF",
      ],
    };
  }
}
