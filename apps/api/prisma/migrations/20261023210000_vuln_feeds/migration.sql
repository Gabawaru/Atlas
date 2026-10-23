-- Findings vulnérabilités passifs : confiance ≠ sévérité, inventaire, cache

ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "confidence" TEXT;
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "cveId" TEXT;
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "kevListed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "feedSources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "matchDisclaimer" TEXT;

CREATE INDEX IF NOT EXISTS "Finding_cveId_idx" ON "Finding"("cveId");

CREATE TABLE IF NOT EXISTS "SoftwareComponent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "missionId" TEXT,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ecosystem" TEXT NOT NULL DEFAULT 'generic',
    "observedFrom" TEXT NOT NULL DEFAULT 'seed',
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "rawEvidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SoftwareComponent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SoftwareComponent_tenantId_name_idx" ON "SoftwareComponent"("tenantId", "name");

DO $$ BEGIN
  ALTER TABLE "SoftwareComponent" ADD CONSTRAINT "SoftwareComponent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SoftwareComponent" ADD CONSTRAINT "SoftwareComponent_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VulnFeedCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VulnFeedCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VulnFeedCache_cacheKey_key" ON "VulnFeedCache"("cacheKey");
CREATE INDEX IF NOT EXISTS "VulnFeedCache_source_expiresAt_idx" ON "VulnFeedCache"("source", "expiresAt");

-- RLS SoftwareComponent (tenantId direct)
ALTER TABLE "SoftwareComponent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SoftwareComponent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_tenant_isolation ON "SoftwareComponent";
CREATE POLICY atlas_tenant_isolation ON "SoftwareComponent"
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      nullif(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      nullif(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "SoftwareComponent" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "VulnFeedCache" TO atlas_app;
