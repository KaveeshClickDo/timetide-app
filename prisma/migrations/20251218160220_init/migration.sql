-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'OUTLOOK', 'APPLE', 'CALDAV');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTISELECT', 'CHECKBOX', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('ROLLING', 'RANGE', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('IN_PERSON', 'PHONE', 'GOOGLE_MEET', 'ZOOM', 'TEAMS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SchedulingType" AS ENUM ('ROUND_ROBIN', 'COLLECTIVE', 'MANAGED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "username" TEXT,
    "image" TEXT,
    "password" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarCredential" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "length" INTEGER NOT NULL,
    "bufferTimeBefore" INTEGER NOT NULL DEFAULT 0,
    "bufferTimeAfter" INTEGER NOT NULL DEFAULT 0,
    "minimumNotice" INTEGER NOT NULL DEFAULT 60,
    "slotInterval" INTEGER,
    "periodType" "PeriodType" NOT NULL DEFAULT 'ROLLING',
    "periodDays" INTEGER,
    "periodStartDate" TIMESTAMP(3),
    "periodEndDate" TIMESTAMP(3),
    "locationType" "LocationType" NOT NULL DEFAULT 'GOOGLE_MEET',
    "locationValue" TEXT,
    "scheduleId" TEXT,
    "maxBookingsPerDay" INTEGER,
    "seatsPerSlot" INTEGER NOT NULL DEFAULT 1,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "hideNotes" BOOLEAN NOT NULL DEFAULT false,
    "successRedirectUrl" TEXT,
    "schedulingType" "SchedulingType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTypeQuestion" (
    "id" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTypeQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DateOverride" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT,
    "endTime" TEXT,

    CONSTRAINT "DateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "inviteeName" TEXT NOT NULL,
    "inviteeEmail" TEXT NOT NULL,
    "inviteePhone" TEXT,
    "inviteeNotes" TEXT,
    "responses" JSONB,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "location" TEXT,
    "meetingUrl" TEXT,
    "calendarEventId" TEXT,
    "assignedUserId" TEXT,
    "source" TEXT,
    "metadata" JSONB,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "rescheduledFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAttendee" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "timezone" TEXT,

    CONSTRAINT "BookingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamMemberRole" NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTypeAssignment" (
    "id" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EventTypeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "eventTriggers" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAnalytics" (
    "id" TEXT NOT NULL,
    "eventTypeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "bookings" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookingAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Calendar_userId_idx" ON "Calendar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_userId_provider_externalId_key" ON "Calendar"("userId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarCredential_calendarId_key" ON "CalendarCredential"("calendarId");

-- CreateIndex
CREATE INDEX "EventType_userId_idx" ON "EventType"("userId");

-- CreateIndex
CREATE INDEX "EventType_teamId_idx" ON "EventType"("teamId");

-- CreateIndex
CREATE INDEX "EventType_slug_idx" ON "EventType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "EventType_userId_slug_key" ON "EventType"("userId", "slug");

-- CreateIndex
CREATE INDEX "EventTypeQuestion_eventTypeId_idx" ON "EventTypeQuestion"("eventTypeId");

-- CreateIndex
CREATE INDEX "AvailabilitySchedule_userId_idx" ON "AvailabilitySchedule"("userId");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_scheduleId_idx" ON "AvailabilitySlot"("scheduleId");

-- CreateIndex
CREATE INDEX "DateOverride_scheduleId_idx" ON "DateOverride"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "DateOverride_scheduleId_date_key" ON "DateOverride"("scheduleId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_uid_key" ON "Booking"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_rescheduledFromId_key" ON "Booking"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "Booking_eventTypeId_idx" ON "Booking"("eventTypeId");

-- CreateIndex
CREATE INDEX "Booking_hostId_idx" ON "Booking"("hostId");

-- CreateIndex
CREATE INDEX "Booking_inviteeEmail_idx" ON "Booking"("inviteeEmail");

-- CreateIndex
CREATE INDEX "Booking_startTime_idx" ON "Booking"("startTime");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "BookingAttendee_bookingId_idx" ON "BookingAttendee"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "Team_slug_idx" ON "Team"("slug");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "EventTypeAssignment_eventTypeId_idx" ON "EventTypeAssignment"("eventTypeId");

-- CreateIndex
CREATE INDEX "EventTypeAssignment_teamMemberId_idx" ON "EventTypeAssignment"("teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTypeAssignment_eventTypeId_teamMemberId_key" ON "EventTypeAssignment"("eventTypeId", "teamMemberId");

-- CreateIndex
CREATE INDEX "Webhook_userId_idx" ON "Webhook"("userId");

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_identifier_endpoint_key" ON "RateLimit"("identifier", "endpoint");

-- CreateIndex
CREATE INDEX "BookingAnalytics_eventTypeId_idx" ON "BookingAnalytics"("eventTypeId");

-- CreateIndex
CREATE INDEX "BookingAnalytics_date_idx" ON "BookingAnalytics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAnalytics_eventTypeId_date_key" ON "BookingAnalytics"("eventTypeId", "date");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarCredential" ADD CONSTRAINT "CalendarCredential_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventType" ADD CONSTRAINT "EventType_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTypeQuestion" ADD CONSTRAINT "EventTypeQuestion_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySchedule" ADD CONSTRAINT "AvailabilitySchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DateOverride" ADD CONSTRAINT "DateOverride_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AvailabilitySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTypeAssignment" ADD CONSTRAINT "EventTypeAssignment_eventTypeId_fkey" FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTypeAssignment" ADD CONSTRAINT "EventTypeAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
