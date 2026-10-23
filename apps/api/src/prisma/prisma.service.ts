import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Prisma + RLS Postgres.
 * - Session : `app.bypass_rls=on` pour seed, migrate, workers, staff.
 * - `asTenant(id, fn)` : transaction SET LOCAL bypass=off + tenant_id → isolation forcée.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    await this.$executeRaw`SELECT set_config('app.bypass_rls', 'on', false)`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Exécute `fn` sous RLS tenant (pas de fuite cross-tenant). */
  async asTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'off', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  /** Transaction explicite en bypass (seed / ops staff). */
  async asBypass<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    });
  }
}
