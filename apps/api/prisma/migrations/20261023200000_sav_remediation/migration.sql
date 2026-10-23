-- Suivi corrections (findings) + tickets SAV / incidents

ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "remediationStatus" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "remediationNote" TEXT;
ALTER TABLE "Finding" ADD COLUMN IF NOT EXISTS "remediatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "missionId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "category" TEXT NOT NULL DEFAULT 'question',
    "createdByUserId" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_status_idx" ON "SupportTicket"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");

DO $$ BEGIN
  ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_missionId_fkey"
    FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS multi-tenant (même pattern que Asset/Mission)
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_tenant_isolation ON "SupportTicket";
CREATE POLICY atlas_tenant_isolation ON "SupportTicket"
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicket" TO atlas_app;
