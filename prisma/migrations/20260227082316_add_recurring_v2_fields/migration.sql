-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "recurringCount" INTEGER,
ADD COLUMN     "recurringFrequency" TEXT,
ADD COLUMN     "recurringGroupId" TEXT,
ADD COLUMN     "recurringIndex" INTEGER,
ADD COLUMN     "recurringInterval" INTEGER;

-- AlterTable
ALTER TABLE "EventType" ADD COLUMN     "allowsRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurringFrequency" TEXT,
ADD COLUMN     "recurringInterval" INTEGER,
ADD COLUMN     "recurringMaxWeeks" INTEGER;

-- CreateIndex
CREATE INDEX "Booking_recurringGroupId_idx" ON "Booking"("recurringGroupId");
