-- Modes déploiement : journal de sync (révocation / preuves) pour offline → online

CREATE TABLE IF NOT EXISTS "SyncJournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    CONSTRAINT "SyncJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncJournalEntry_tenantId_status_idx" ON "SyncJournalEntry"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "SyncJournalEntry_status_createdAt_idx" ON "SyncJournalEntry"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "SyncJournalEntry" ADD CONSTRAINT "SyncJournalEntry_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SyncJournalEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncJournalEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_tenant_isolation ON "SyncJournalEntry";
CREATE POLICY atlas_tenant_isolation ON "SyncJournalEntry"
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "SyncJournalEntry" TO atlas_app;
