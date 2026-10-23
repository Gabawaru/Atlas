import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: "atlas-api",
      version: "0.1.0-mvp",
      notes: [
        "Abonnement ≠ autorisation pentest",
        "Approbation A ≠ autorisation propriétaire",
        "IA hors chemin d'exécution",
      ],
    };
  }
}
