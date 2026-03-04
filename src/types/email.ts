// Centralized email types

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export interface BookingEmailData {
  hostName: string
  hostEmail: string
  hostUsername?: string
  inviteeName: string
  inviteeEmail: string
  eventTitle: string
  eventSlug?: string
  eventDescription?: string
  startTime: string
  endTime: string
  timezone: string
  location?: string
  meetingUrl?: string
  bookingUid: string
  notes?: string
  teamMembers?: Array<{ name: string; email: string }>
}

export interface RecurringBookingEmailData extends BookingEmailData {
  recurringDates: Array<{ startTime: string; endTime: string }>
  totalOccurrences: number
  frequencyLabel?: string
}

export interface TeamEmailData {
  memberName: string
  teamName: string
  actorName: string
  role: string
  teamUrl: string
}
