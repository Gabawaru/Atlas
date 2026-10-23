-- Versions produit, config maintenance globale, journal ops
CREATE TABLE "ProductVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "title" TEXT NOT NULL,
    "releaseNotes" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductVersion_version_key" ON "ProductVersion"("version");

CREATE TABLE "OpsRuntimeConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceReason" TEXT,
    "maintenanceSetAt" TIMESTAMP(3),
    "maintenanceSetBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsRuntimeConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpsJournalEntry" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsJournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OpsJournalEntry_createdAt_idx" ON "OpsJournalEntry"("createdAt");

INSERT INTO "OpsRuntimeConfig" ("id", "maintenanceMode", "updatedAt")
VALUES ('default', false, CURRENT_TIMESTAMP);
