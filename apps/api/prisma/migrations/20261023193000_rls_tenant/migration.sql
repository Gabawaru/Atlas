-- Durcissement multi-tenant : RLS Postgres (FORCE)
-- bypass via SET app.bypass_rls = 'on' (migrations, seed, staff, workers)
-- isolation via SET LOCAL app.tenant_id dans une transaction

ALTER TABLE "JobRun" ADD COLUMN IF NOT EXISTS "deadLetteredAt" TIMESTAMP(3);
ALTER TABLE "JobRun" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;

-- Helper : bypass OU match tenant
-- Tables avec tenantId direct
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Asset',
    'SecretRef',
    'ConnectorGrant',
    'Mission',
    'JobRun',
    'Subscription',
    'TenantMembership'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS atlas_tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY atlas_tenant_isolation ON %I
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
      )
    $f$, t);
  END LOOP;
END $$;

-- AuditEvent : tenantId nullable — bypass OU null OU match
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_tenant_isolation ON "AuditEvent";
CREATE POLICY atlas_tenant_isolation ON "AuditEvent"
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" IS NULL
    OR (
      nullif(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenantId" IS NULL
    OR (
      nullif(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  );

-- ApprovalRoutingPolicy : tenantId nullable + orgWide
ALTER TABLE "ApprovalRoutingPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalRoutingPolicy" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_tenant_isolation ON "ApprovalRoutingPolicy";
CREATE POLICY atlas_tenant_isolation ON "ApprovalRoutingPolicy"
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "orgWide" = true
    OR "tenantId" IS NULL
    OR (
      nullif(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "orgWide" = true
    OR "tenantId" IS NULL
    OR (
      nullif(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenantId" = current_setting('app.tenant_id', true)
    )
  );

-- Tables liées à Mission (pas de tenantId direct)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ScopeVersion',
    'OwnerAuthorization',
    'ApprovalRequest',
    'AuthorizationToken',
    'Finding',
    'Report'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS atlas_tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY atlas_tenant_isolation ON %I
      FOR ALL
      USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR EXISTS (
          SELECT 1 FROM "Mission" m
          WHERE m.id = %I."missionId"
            AND m."tenantId" = current_setting('app.tenant_id', true)
        )
      )
      WITH CHECK (
        current_setting('app.bypass_rls', true) = 'on'
        OR EXISTS (
          SELECT 1 FROM "Mission" m
          WHERE m.id = %I."missionId"
            AND m."tenantId" = current_setting('app.tenant_id', true)
        )
      )
    $f$, t, t, t);
  END LOOP;
END $$;

-- ApprovalDecision via ApprovalRequest → Mission
ALTER TABLE "ApprovalDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDecision" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_tenant_isolation ON "ApprovalDecision";
CREATE POLICY atlas_tenant_isolation ON "ApprovalDecision"
  FOR ALL
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "ApprovalRequest" r
      JOIN "Mission" m ON m.id = r."missionId"
      WHERE r.id = "ApprovalDecision"."requestId"
        AND m."tenantId" = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "ApprovalRequest" r
      JOIN "Mission" m ON m.id = r."missionId"
      WHERE r.id = "ApprovalDecision"."requestId"
        AND m."tenantId" = current_setting('app.tenant_id', true)
    )
  );
