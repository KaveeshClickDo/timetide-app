-- Phase 1: Migrate to app-managed subscriptions
-- Stripe only handles payments. App manages plans, billing cycles, and state.

-- Remove Stripe subscription ID from User (no longer managing Stripe subscriptions)
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeSubscriptionId";

-- Add new fields to User
ALTER TABLE "User" ADD COLUMN "stripePaymentMethodId" TEXT;
ALTER TABLE "User" ADD COLUMN "lastPaymentAt" TIMESTAMP(3);

-- Drop StripeWebhookLog table (no longer receiving Stripe webhooks for subscription events)
DROP TABLE IF EXISTS "StripeWebhookLog";

-- Create Plan table (replaces hardcoded PRICING_TIERS + PLAN_LIMITS)
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "highlightText" TEXT,
    "priceLabel" TEXT,
    "priceSuffix" TEXT,
    "maxEventTypes" INTEGER NOT NULL DEFAULT 1,
    "maxWebhooks" INTEGER NOT NULL DEFAULT 0,
    "customQuestions" BOOLEAN NOT NULL DEFAULT false,
    "groupBooking" BOOLEAN NOT NULL DEFAULT false,
    "recurringBooking" BOOLEAN NOT NULL DEFAULT false,
    "teams" BOOLEAN NOT NULL DEFAULT false,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "features" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- Create unique index on Plan.tier
CREATE UNIQUE INDEX "Plan_tier_key" ON "Plan"("tier");

-- Create Payment table
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "planTier" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "billingPeriodStart" TIMESTAMP(3),
    "billingPeriodEnd" TIMESTAMP(3),
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Create unique index on Payment.stripePaymentIntentId
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- Create indexes on Payment
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- Add foreign key on Payment -> User
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed initial plans with current hardcoded values
INSERT INTO "Plan" ("id", "tier", "name", "price", "currency", "intervalDays", "isActive", "sortOrder", "description", "highlightText", "priceLabel", "priceSuffix", "maxEventTypes", "maxWebhooks", "customQuestions", "groupBooking", "recurringBooking", "teams", "analytics", "features", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'FREE', 'Free', 0, 'usd', 30, true, 0, 'Perfect for getting started', NULL, 'Free', '', 1, 0, false, false, false, false, false, '["1 Event Type", "Unlimited Bookings", "Google Meet Integration", "Email Notifications", "Basic Availability"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PRO', 'Pro', 1200, 'usd', 30, true, 1, 'For professionals who need more', 'Most Popular', '$12', '/month', 999999, 10, true, true, true, false, false, '["Unlimited Event Types", "Custom Questions", "Group Bookings", "Recurring Bookings", "Up to 10 Webhooks", "Zoom & Teams Integration", "Priority Support"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'TEAM', 'Team', 2000, 'usd', 30, true, 2, 'For teams and organizations', NULL, '$20', '/month', 999999, 999999, true, true, true, true, true, '["Everything in Pro", "Team Scheduling", "Round-Robin & Collective", "Advanced Analytics", "Unlimited Webhooks", "Team Management", "Admin Dashboard"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
