import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import {
  registryPublicCatalog,
  registrySummary,
  listWiredModuleIds,
  DEFAULT_PASSIVE_SUITE_IDS,
  DEFAULT_LOCAL_SUITE_IDS,
  getModuleDefinition,
} from "./modules";

/**
 * Catalogue modules shortlist — lecture seule.
 * N'exécute rien : l'exécution passe par mission + Policy Guard + BullMQ.
 */
@Controller("v1/modules")
@UseGuards(AuthGuard)
export class ModulesController {
  @Get()
  list() {
    return {
      summary: registrySummary(),
      defaultPassiveSuite: DEFAULT_PASSIVE_SUITE_IDS,
      defaultLocalSuite: DEFAULT_LOCAL_SUITE_IDS,
      wiredIds: listWiredModuleIds(),
      modules: registryPublicCatalog(),
      disclaimer:
        "Catalogue défensif uniquement. Exécution uniquement via mission autorisée + Policy Guard.",
    };
  }

  @Get(":id")
  one(@Param("id") id: string) {
    const def = getModuleDefinition(id);
    if (!def) {
      return { found: false, id };
    }
    return {
      found: true,
      module: registryPublicCatalog().find((m) => m.id === id),
    };
  }
}
