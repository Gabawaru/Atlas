-- Assistant conversationnel : plafonds plan + journal usage LLM (sans contenu sensible)

ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "llmTokenCapMonthly" INTEGER NOT NULL DEFAULT 200000;
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "llmEuroCapCentsMonthly" INTEGER NOT NULL DEFAULT 500;

CREATE TABLE IF NOT EXISTS "LlmUsageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedEuroCents" INTEGER NOT NULL DEFAULT 0,
    "intent" TEXT,
    "messageFingerprint" TEXT,
    "messageChars" INTEGER NOT NULL DEFAULT 0,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LlmUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LlmUsageLog_tenantId_createdAt_idx" ON "LlmUsageLog"("tenantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "LlmUsageLog" ADD CONSTRAINT "LlmUsageLog_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "LlmUsageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LlmUsageLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_tenant_isolation ON "LlmUsageLog";
CREATE POLICY atlas_tenant_isolation ON "LlmUsageLog"
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

GRANT SELECT, INSERT, UPDATE, DELETE ON "LlmUsageLog" TO atlas_app;
