-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'ACTIVE', 'UNSUBSCRIBED', 'GRACE_PERIOD', 'DOWNGRADING', 'LOCKED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_EXPIRING_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_GRACE_PERIOD_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_GRACE_PERIOD_ENDING';
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_LOCKED';
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_CLEANUP_WARNING';
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_DOWNGRADED';
ALTER TYPE "NotificationType" ADD VALUE 'PLAN_REACTIVATED';

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "lockedByDowngrade" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cleanupScheduledAt" TIMESTAMP(3),
ADD COLUMN     "downgradeInitiatedBy" TEXT,
ADD COLUMN     "downgradeReason" TEXT,
ADD COLUMN     "gracePeriodEndsAt" TIMESTAMP(3),
ADD COLUMN     "planActivatedAt" TIMESTAMP(3),
ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN     "lockedByDowngrade" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromPlan" TEXT NOT NULL,
    "toPlan" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "initiatedBy" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionHistory_userId_createdAt_idx" ON "SubscriptionHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_action_idx" ON "SubscriptionHistory"("action");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
