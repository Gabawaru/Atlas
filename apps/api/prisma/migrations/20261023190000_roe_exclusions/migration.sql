-- RoE machine-readable : exclusions + notes versionnées
ALTER TABLE "ScopeVersion" ADD COLUMN IF NOT EXISTS "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ScopeVersion" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Co-signature deux parties (mock pluggable)
ALTER TABLE "OwnerAuthorization" ADD COLUMN IF NOT EXISTS "counterpartyLabel" TEXT;
ALTER TABLE "OwnerAuthorization" ADD COLUMN IF NOT EXISTS "counterpartyEmail" TEXT;
ALTER TABLE "OwnerAuthorization" ADD COLUMN IF NOT EXISTS "ownerSignedAt" TIMESTAMP(3);
ALTER TABLE "OwnerAuthorization" ADD COLUMN IF NOT EXISTS "counterpartySignedAt" TIMESTAMP(3);
