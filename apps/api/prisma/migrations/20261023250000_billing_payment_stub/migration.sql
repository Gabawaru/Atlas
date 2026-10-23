-- Stub paiements (pas de PSP réel) — hors chemin Policy Guard
CREATE TABLE "PaymentStub" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stub',
    "externalRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "PaymentStub_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentStub" ADD CONSTRAINT "PaymentStub_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
