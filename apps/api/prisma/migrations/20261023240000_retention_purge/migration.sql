-- Rétention & purge : legal hold tenant + journal PurgeRun

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "legalHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "legalHoldReason" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "legalHoldAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PurgeRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "heldSkipped" BOOLEAN NOT NULL DEFAULT false,
    "categories" TEXT[] NOT NULL,
    "deletedCounts" JSONB NOT NULL,
    "notes" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurgeRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PurgeRun_tenantId_createdAt_idx" ON "PurgeRun"("tenantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PurgeRun" ADD CONSTRAINT "PurgeRun_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "PurgeRun" TO atlas_app;
