/**
 * Outlook Calendar Integration
 * Handles OAuth, fetching busy times, and creating calendar events using Microsoft Graph API
 */

import prisma from '../prisma'
import { BusyTime } from '../slots/calculator'
import { CreateCalendarEventParams, CreateCalendarEventResult } from './google'

// Microsoft Graph API base URL
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0'

// Microsoft OAuth endpoints
const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0'

// ============================================================================
// OAUTH CONFIGURATION
// ============================================================================

function getMicrosoftOAuthConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/calendars/outlook/callback`

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft OAuth credentials not configured')
  }

  return { clientId, clientSecret, redirectUri }
}

export function getOutlookAuthUrl(userId: string): string {
  const { clientId, redirectUri } = getMicrosoftOAuthConfig()

  const scopes = [
    'offline_access',
    'User.Read',
    'Calendars.ReadWrite',
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state: userId,
    response_mode: 'query',
  })

  return `${MICROSOFT_AUTH_URL}/authorize?${params.toString()}`
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export async function exchangeCodeForTokens(code: string): Promise<MicrosoftTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getMicrosoftOAuthConfig()

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const response = await fetch(`${MICROSOFT_AUTH_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Microsoft token exchange error:', error)
    throw new Error('Failed to exchange code for tokens')
  }

  return response.json()
}

export async function refreshOutlookAccessToken(calendarId: string): Promise<string | null> {
  const calendar = await prisma.calendar.findUnique({
    where: { id: calendarId },
    include: { credentials: true },
  })

  if (!calendar?.credentials?.refreshToken) {
    return null
  }

  const { clientId, clientSecret } = getMicrosoftOAuthConfig()

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: calendar.credentials.refreshToken,
    grant_type: 'refresh_token',
  })

  try {
    const response = await fetch(`${MICROSOFT_AUTH_URL}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error('Failed to refresh token')
    }

    const tokens: MicrosoftTokenResponse = await response.json()

    // Update stored tokens
    await prisma.calendarCredential.update({
      where: { id: calendar.credentials.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || calendar.credentials.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    })

    return tokens.access_token
  } catch (error) {
    console.error('Failed to refresh Outlook token:', error)
    return null
  }
}

async function getAuthenticatedHeaders(calendarId: string): Promise<HeadersInit> {
  const calendar = await prisma.calendar.findUnique({
    where: { id: calendarId },
    include: { credentials: true },
  })

  if (!calendar?.credentials) {
    throw new Error('Calendar credentials not found')
  }

  let accessToken = calendar.credentials.accessToken

  // Check if token is expired
  if (calendar.credentials.expiresAt && new Date() >= calendar.credentials.expiresAt) {
    const newAccessToken = await refreshOutlookAccessToken(calendarId)
    if (!newAccessToken) {
      throw new Error('Failed to refresh access token')
    }
    accessToken = newAccessToken
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

// ============================================================================
// CALENDAR CONNECTION
// ============================================================================

interface MicrosoftUserResponse {
  id: string
  displayName: string
  mail: string
  userPrincipalName: string
}

interface MicrosoftCalendarResponse {
  id: string
  name: string
  color: string
  isDefaultCalendar: boolean
}

export async function connectOutlookCalendar(userId: string, code: string) {
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code)

  if (!tokens.access_token) {
    throw new Error('No access token received from Microsoft')
  }

  const headers = {
    Authorization: `Bearer ${tokens.access_token}`,
    'Content-Type': 'application/json',
  }

  // Get user info
  const userResponse = await fetch(`${GRAPH_API_BASE}/me`, { headers })
  if (!userResponse.ok) {
    throw new Error('Failed to fetch Microsoft user info')
  }
  const user: MicrosoftUserResponse = await userResponse.json()

  // Get primary calendar
  const calendarResponse = await fetch(`${GRAPH_API_BASE}/me/calendar`, { headers })
  if (!calendarResponse.ok) {
    throw new Error('Failed to fetch Microsoft calendar')
  }
  const calendarData: MicrosoftCalendarResponse = await calendarResponse.json()

  // Check if calendar already exists for this user
  const existingCalendar = await prisma.calendar.findFirst({
    where: {
      userId,
      provider: 'OUTLOOK',
      externalId: calendarData.id,
    },
  })

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  if (existingCalendar) {
    // Update existing calendar with new tokens
    const calendar = await prisma.calendar.update({
      where: { id: existingCalendar.id },
      data: {
        name: calendarData.name || `${user.displayName}'s Calendar`,
        isEnabled: true,
        credentials: {
          upsert: {
            create: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || undefined,
              expiresAt,
            },
            update: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || undefined,
              expiresAt,
            },
          },
        },
      },
      include: {
        credentials: true,
      },
    })
    return calendar
  }

  // Check if user has any existing calendars
  const hasExistingCalendars = await prisma.calendar.count({
    where: { userId },
  })

  // Create new calendar
  const calendar = await prisma.calendar.create({
    data: {
      userId,
      name: calendarData.name || `${user.displayName}'s Calendar`,
      provider: 'OUTLOOK',
      externalId: calendarData.id,
      isPrimary: hasExistingCalendars === 0,
      isEnabled: true,
      credentials: {
        create: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || undefined,
          expiresAt,
        },
      },
    },
    include: {
      credentials: true,
    },
  })

  return calendar
}

// ============================================================================
// BUSY TIMES
// ============================================================================

interface MicrosoftScheduleItem {
  status: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
}

interface MicrosoftScheduleResponse {
  value: Array<{
    scheduleId: string
    scheduleItems: MicrosoftScheduleItem[]
  }>
}

export async function getOutlookBusyTimes(
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<BusyTime[]> {
  try {
    const headers = await getAuthenticatedHeaders(calendarId)

    const calendar = await prisma.calendar.findUnique({
      where: { id: calendarId },
    })

    if (!calendar) {
      return []
    }

    // Use the calendar view endpoint to get events
    const startDateTime = timeMin.toISOString()
    const endDateTime = timeMax.toISOString()

    const response = await fetch(
      `${GRAPH_API_BASE}/me/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}&$select=start,end,showAs`,
      { headers }
    )

    if (!response.ok) {
      console.error('Failed to fetch Outlook busy times:', await response.text())
      return []
    }

    const data = await response.json()
    const events: Array<{
      start: { dateTime: string; timeZone: string }
      end: { dateTime: string; timeZone: string }
      showAs: string
    }> = data.value || []

    // Filter for busy events (not free or tentative)
    return events
      .filter((event) => event.showAs === 'busy' || event.showAs === 'oof' || event.showAs === 'workingElsewhere')
      .map((event) => ({
        start: new Date(event.start.dateTime + 'Z'),
        end: new Date(event.end.dateTime + 'Z'),
      }))
  } catch (error) {
    console.error('Failed to fetch Outlook busy times:', error)
    return []
  }
}

// ============================================================================
// EVENT CREATION
// ============================================================================

interface MicrosoftEventRequest {
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

interface MicrosoftEventResponse {
  id: string
  webLink: string
  onlineMeeting?: {
    joinUrl: string
  }
}

export async function createOutlookCalendarEvent(
  params: CreateCalendarEventParams
): Promise<CreateCalendarEventResult> {
  try {
    const headers = await getAuthenticatedHeaders(params.calendarId)

    const event: MicrosoftEventRequest = {
      subject: params.summary,
      start: {
        dateTime: params.startTime.toISOString().replace('Z', ''),
        timeZone: 'UTC',
      },
      end: {
        dateTime: params.endTime.toISOString().replace('Z', ''),
        timeZone: 'UTC',
      },
      attendees: params.attendees.map((a) => ({
        emailAddress: {
          address: a.email,
          name: a.name,
        },
        type: 'required',
      })),
    }

    if (params.description) {
      event.body = {
        contentType: 'HTML',
        content: params.description,
      }
    }

    if (params.location) {
      event.location = {
        displayName: params.location,
      }
    }

    // Create Teams meeting if conferenceData is requested
    if (params.conferenceData) {
      event.isOnlineMeeting = true
      event.onlineMeetingProvider = 'teamsForBusiness'
    }

    const response = await fetch(`${GRAPH_API_BASE}/me/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Failed to create Outlook event:', error)
      return { eventId: null, meetLink: null }
    }

    const createdEvent: MicrosoftEventResponse = await response.json()

    console.log('Created Outlook Calendar event:', {
      eventId: createdEvent.id,
      hasMeetLink: !!createdEvent.onlineMeeting?.joinUrl,
    })

    return {
      eventId: createdEvent.id,
      meetLink: createdEvent.onlineMeeting?.joinUrl ?? null,
    }
  } catch (error) {
    console.error('Failed to create Outlook Calendar event:', error)
    return { eventId: null, meetLink: null }
  }
}

export async function deleteOutlookCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<boolean> {
  try {
    const headers = await getAuthenticatedHeaders(calendarId)

    const response = await fetch(`${GRAPH_API_BASE}/me/events/${eventId}`, {
      method: 'DELETE',
      headers,
    })

    return response.ok || response.status === 404
  } catch (error) {
    console.error('Failed to delete Outlook Calendar event:', error)
    return false
  }
}

export async function updateOutlookCalendarEvent(
  calendarId: string,
  eventId: string,
  updates: Partial<CreateCalendarEventParams>
): Promise<boolean> {
  try {
    const headers = await getAuthenticatedHeaders(calendarId)

    const event: Partial<MicrosoftEventRequest> = {}

    if (updates.summary) event.subject = updates.summary
    if (updates.description) {
      event.body = {
        contentType: 'HTML',
        content: updates.description,
      }
    }
    if (updates.location) {
      event.location = {
        displayName: updates.location,
      }
    }
    if (updates.startTime) {
      event.start = {
        dateTime: updates.startTime.toISOString().replace('Z', ''),
        timeZone: 'UTC',
      }
    }
    if (updates.endTime) {
      event.end = {
        dateTime: updates.endTime.toISOString().replace('Z', ''),
        timeZone: 'UTC',
      }
    }
    if (updates.attendees) {
      event.attendees = updates.attendees.map((a) => ({
        emailAddress: {
          address: a.email,
          name: a.name,
        },
        type: 'required',
      }))
    }

    const response = await fetch(`${GRAPH_API_BASE}/me/events/${eventId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(event),
    })

    return response.ok
  } catch (error) {
    console.error('Failed to update Outlook Calendar event:', error)
    return false
  }
}
