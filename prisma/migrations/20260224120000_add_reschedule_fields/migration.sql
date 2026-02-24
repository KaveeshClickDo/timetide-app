-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "rescheduleReason" TEXT;
ALTER TABLE "Booking" ADD COLUMN "lastRescheduledAt" TIMESTAMP(3);
