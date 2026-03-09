-- AlterTable
ALTER TABLE "BookingAttendee" ADD COLUMN     "calendarEventIds" JSONB,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "BookingAttendee_userId_idx" ON "BookingAttendee"("userId");

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
