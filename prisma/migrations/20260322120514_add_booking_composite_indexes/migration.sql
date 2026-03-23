-- CreateIndex
CREATE INDEX "Booking_hostId_startTime_status_idx" ON "Booking"("hostId", "startTime", "status");

-- CreateIndex
CREATE INDEX "Booking_eventTypeId_startTime_status_idx" ON "Booking"("eventTypeId", "startTime", "status");
