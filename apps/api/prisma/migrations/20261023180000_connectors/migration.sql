-- Connecteurs : grants révocables (pas de secrets en clair)
CREATE TABLE "ConnectorGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grantedPermissions" TEXT[],
    "grantedScopes" TEXT[],
    "externalRef" TEXT,
    "isStub" BOOLEAN NOT NULL DEFAULT false,
    "productionReady" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ConnectorGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConnectorGrant_tenantId_connectorId_status_idx" ON "ConnectorGrant"("tenantId", "connectorId", "status");

ALTER TABLE "ConnectorGrant" ADD CONSTRAINT "ConnectorGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
