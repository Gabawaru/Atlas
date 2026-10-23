-- Progression / BullMQ / kill
ALTER TABLE "JobRun" ADD COLUMN "progressPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "JobRun" ADD COLUMN "progressMessage" TEXT;
ALTER TABLE "JobRun" ADD COLUMN "bullJobId" TEXT;
ALTER TABLE "JobRun" ADD COLUMN "killedAt" TIMESTAMP(3);

-- Exports rapport
ALTER TABLE "Report" ADD COLUMN "exportCsv" TEXT;
ALTER TABLE "Report" ADD COLUMN "exportPdfPath" TEXT;
ALTER TABLE "Report" ADD COLUMN "exportsMarkedSynthetic" BOOLEAN NOT NULL DEFAULT true;

-- Signature pluggable (métadonnées — pas de secret)
ALTER TABLE "OwnerAuthorization" ADD COLUMN "signatureProvider" TEXT;
ALTER TABLE "OwnerAuthorization" ADD COLUMN "signatureEnvelopeId" TEXT;
ALTER TABLE "OwnerAuthorization" ADD COLUMN "signatureStatus" TEXT;
