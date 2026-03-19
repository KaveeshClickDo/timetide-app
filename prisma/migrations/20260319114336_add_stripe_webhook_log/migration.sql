-- CreateTable
CREATE TABLE "StripeWebhookLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "apiVersion" TEXT,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "processingStatus" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "processingTimeMs" INTEGER,
    "userId" TEXT,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookLog_eventId_key" ON "StripeWebhookLog"("eventId");

-- CreateIndex
CREATE INDEX "StripeWebhookLog_eventType_idx" ON "StripeWebhookLog"("eventType");

-- CreateIndex
CREATE INDEX "StripeWebhookLog_processingStatus_idx" ON "StripeWebhookLog"("processingStatus");

-- CreateIndex
CREATE INDEX "StripeWebhookLog_createdAt_idx" ON "StripeWebhookLog"("createdAt");
