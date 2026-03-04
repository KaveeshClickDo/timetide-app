// Centralized calendar integration types

// ============================================================================
// SHARED CALENDAR TYPES
// ============================================================================

export interface CreateCalendarEventParams {
  calendarId: string
  summary: string
  description?: string
  startTime: Date
  endTime: Date
  attendees: Array<{ email: string; name?: string }>
  location?: string
  conferenceData?: boolean
}

export interface CreateCalendarEventResult {
  eventId: string | null
  meetLink: string | null
}

export interface ConflictResult {
  hasConflict: boolean
  conflictingEvents: Array<{
    title: string | null
    startTime: Date
    endTime: Date
    source: 'external' | 'booking'
  }>
}

// ============================================================================
// MICROSOFT / OUTLOOK TYPES
// ============================================================================

export interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export interface MicrosoftUserResponse {
  id: string
  displayName: string
  mail: string
  userPrincipalName: string
}

export interface MicrosoftCalendarResponse {
  id: string
  name: string
  color: string
  isDefaultCalendar: boolean
  allowedOnlineMeetingProviders?: string[]
}

export interface MicrosoftScheduleItem {
  status: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
}

export interface MicrosoftScheduleResponse {
  value: Array<{
    scheduleId: string
    scheduleItems: MicrosoftScheduleItem[]
  }>
}

export interface MicrosoftEventRequest {
  subject: string
  body?: {
    contentType: string
    content: string
  }
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  location?: {
    displayName: string
  }
  attendees?: Array<{
    emailAddress: {
      address: string
      name?: string
    }
    type: string
  }>
  isOnlineMeeting?: boolean
  onlineMeetingProvider?: string
}

export interface MicrosoftEventResponse {
  id: string
  webLink: string
  onlineMeeting?: {
    joinUrl: string
  }
}
