/**
 * Google Calendar Integration
 * Handles OAuth, fetching busy times, and creating calendar events
 */

import { google, calendar_v3 } from 'googleapis';
import prisma from '../prisma';
import { BusyTime } from '../slots/calculator';
import { getOutlookBusyTimes } from './outlook';

// ============================================================================
// OAUTH CLIENT
// ============================================================================

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/calendars/google/callback`
  );
}

export function getGoogleAuthUrl(userId: string): string {
  const oauth2Client = getGoogleOAuthClient();

  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state: userId,
    prompt: 'consent',
  });
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getGoogleOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Connect a Google Calendar account for a user
 * Exchanges OAuth code for tokens and saves to database
 */
export async function connectGoogleCalendar(userId: string, code: string) {
  const oauth2Client = getGoogleOAuthClient();

  // Exchange authorization code for tokens
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('No access token received from Google');
  }

  // Set credentials to fetch calendar info
  oauth2Client.setCredentials(tokens);
  const calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });

  // Get primary calendar info
  const calendarList = await calendarApi.calendarList.list();
  const primaryCalendar = calendarList.data.items?.find((cal) => cal.primary);

  if (!primaryCalendar?.id) {
    throw new Error('No primary calendar found');
  }

  // Check if calendar already exists for this user
  const existingCalendar = await prisma.calendar.findFirst({
    where: {
      userId,
      provider: 'GOOGLE',
      externalId: primaryCalendar.id,
    },
  });

  if (existingCalendar) {
    // Update existing calendar with new tokens
    const calendar = await prisma.calendar.update({
      where: { id: existingCalendar.id },
      data: {
        name: primaryCalendar.summary || 'Google Calendar',
        isEnabled: true,
        credentials: {
          upsert: {
            create: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || undefined,
              expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            },
            update: {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token || undefined,
              expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            },
          },
        },
      },
      include: {
        credentials: true,
      },
    });
    return calendar;
  }

  // Check if user has any existing calendars
  const hasExistingCalendars = await prisma.calendar.count({
    where: { userId },
  });

  // Create new calendar
  const calendar = await prisma.calendar.create({
    data: {
      userId,
      name: primaryCalendar.summary || 'Google Calendar',
      provider: 'GOOGLE',
      externalId: primaryCalendar.id,
      isPrimary: hasExistingCalendars === 0, // Set as primary if it's the first calendar
      isEnabled: true,
      color: primaryCalendar.backgroundColor || undefined,
      credentials: {
        create: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || undefined,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
      },
    },
    include: {
      credentials: true,
    },
  });

  return calendar;
}

export async function refreshAccessToken(calendarId: string): Promise<string | null> {
  const calendar = await prisma.calendar.findUnique({
    where: { id: calendarId },
    include: { credentials: true },
  });

  if (!calendar?.credentials?.refreshToken) {
    return null;
  }

  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: calendar.credentials.refreshToken,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update stored tokens
    await prisma.calendarCredential.update({
      where: { id: calendar.credentials.id },
      data: {
        accessToken: credentials.access_token!,
        expiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : null,
      },
    });

    return credentials.access_token!;
  } catch (error) {
    console.error('Failed to refresh Google token:', error);
    return null;
  }
}

async function getAuthenticatedClient(calendarId: string) {
  const calendar = await prisma.calendar.findUnique({
    where: { id: calendarId },
    include: { credentials: true },
  });

  if (!calendar?.credentials) {
    throw new Error('Calendar credentials not found');
  }

  const oauth2Client = getGoogleOAuthClient();

  // Check if token is expired
  if (
    calendar.credentials.expiresAt &&
    new Date() >= calendar.credentials.expiresAt
  ) {
    const newAccessToken = await refreshAccessToken(calendarId);
    if (!newAccessToken) {
      throw new Error('Failed to refresh access token');
    }
    oauth2Client.setCredentials({ access_token: newAccessToken });
  } else {
    oauth2Client.setCredentials({
      access_token: calendar.credentials.accessToken,
      refresh_token: calendar.credentials.refreshToken,
    });
  }

  return { oauth2Client, calendar };
}

// ============================================================================
// CALENDAR OPERATIONS
// ============================================================================

export async function listCalendars(
  userId: string
): Promise<calendar_v3.Schema$CalendarListEntry[]> {
  const calendars = await prisma.calendar.findMany({
    where: { userId, provider: 'GOOGLE', isEnabled: true },
    include: { credentials: true },
  });

  if (calendars.length === 0) {
    return [];
  }

  try {
    const { oauth2Client } = await getAuthenticatedClient(calendars[0].id);
    const calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendarApi.calendarList.list();
    return response.data.items ?? [];
  } catch (error) {
    console.error('Failed to list calendars:', error);
    return [];
  }
}

/**
 * Fetch busy times from Google Calendar
 */
export async function getGoogleBusyTimes(
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<BusyTime[]> {
  try {
    const { oauth2Client, calendar } = await getAuthenticatedClient(calendarId);
    const calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendarApi.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendar.externalId }],
      },
    });

    const busyPeriods = response.data.calendars?.[calendar.externalId]?.busy ?? [];

    return busyPeriods.map((period) => ({
      start: new Date(period.start!),
      end: new Date(period.end!),
    }));
  } catch (error) {
    console.error('Failed to fetch Google busy times:', error);
    return [];
  }
}

/**
 * Fetch busy times from all enabled calendars for a user
 * Returns empty array if no calendars connected (graceful degradation)
 */
export async function getAllBusyTimes(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<BusyTime[]> {
  try {
    const calendars = await prisma.calendar.findMany({
      where: { userId, isEnabled: true },
    });

    // If no calendars connected, return empty array (this is OK!)
    if (calendars.length === 0) {
      console.log(`No calendars connected for user ${userId}, skipping busy time fetch`);
      return [];
    }

    const allBusyTimes: BusyTime[] = [];

    for (const calendar of calendars) {
      try {
        let busyTimes: BusyTime[] = [];

        if (calendar.provider === 'GOOGLE') {
          busyTimes = await getGoogleBusyTimes(calendar.id, timeMin, timeMax);
        } else if (calendar.provider === 'OUTLOOK') {
          busyTimes = await getOutlookBusyTimes(calendar.id, timeMin, timeMax);
        }

        allBusyTimes.push(...busyTimes);
      } catch (calError) {
        // Log but continue with other calendars
        console.warn(`Failed to fetch busy times from calendar ${calendar.id}:`, calError);
      }
    }

    return allBusyTimes;
  } catch (error) {
    console.error('Error in getAllBusyTimes:', error);
    // Return empty array on error - don't break slot calculation
    return [];
  }
}

// ============================================================================
// EVENT CREATION
// ============================================================================

export interface CreateCalendarEventParams {
  calendarId: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees: Array<{ email: string; name?: string }>;
  location?: string;
  conferenceData?: boolean; // Auto-create Google Meet link
}

export interface CreateCalendarEventResult {
  eventId: string | null;
  meetLink: string | null;
}

export async function createGoogleCalendarEvent(
  params: CreateCalendarEventParams
): Promise<CreateCalendarEventResult> {
  try {
    const { oauth2Client, calendar } = await getAuthenticatedClient(
      params.calendarId
    );
    const calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });

    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      start: {
        dateTime: params.startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: params.endTime.toISOString(),
        timeZone: 'UTC',
      },
      attendees: params.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
      })),
      location: params.location,
    };

    // Add Google Meet if requested
    if (params.conferenceData) {
      event.conferenceData = {
        createRequest: {
          requestId: `timetide-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const response = await calendarApi.events.insert({
      calendarId: calendar.externalId,
      requestBody: event,
      conferenceDataVersion: params.conferenceData ? 1 : 0,
      sendUpdates: 'all',
    });

    // Extract Google Meet link if created
    const meetLink = response.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri ?? null;

    console.log('Created Google Calendar event:', {
      eventId: response.data.id,
      hasMeetLink: !!meetLink,
      meetLink,
    });

    return {
      eventId: response.data.id ?? null,
      meetLink,
    };
  } catch (error) {
    console.error('Failed to create Google Calendar event:', error);
    return { eventId: null, meetLink: null };
  }
}

/**
 * Delete a calendar event
 */
export async function deleteGoogleCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<boolean> {
  try {
    const { oauth2Client, calendar } = await getAuthenticatedClient(calendarId);
    const calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });

    await calendarApi.events.delete({
      calendarId: calendar.externalId,
      eventId,
      sendUpdates: 'all',
    });

    return true;
  } catch (error) {
    console.error('Failed to delete Google Calendar event:', error);
    return false;
  }
}

/**
 * Update a calendar event
 */
export async function updateGoogleCalendarEvent(
  calendarId: string,
  eventId: string,
  updates: Partial<CreateCalendarEventParams>
): Promise<boolean> {
  try {
    const { oauth2Client, calendar } = await getAuthenticatedClient(calendarId);
    const calendarApi = google.calendar({ version: 'v3', auth: oauth2Client });

    const event: calendar_v3.Schema$Event = {};

    if (updates.summary) event.summary = updates.summary;
    if (updates.description) event.description = updates.description;
    if (updates.location) event.location = updates.location;
    if (updates.startTime) {
      event.start = {
        dateTime: updates.startTime.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (updates.endTime) {
      event.end = {
        dateTime: updates.endTime.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (updates.attendees) {
      event.attendees = updates.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
      }));
    }

    await calendarApi.events.patch({
      calendarId: calendar.externalId,
      eventId,
      requestBody: event,
      sendUpdates: 'all',
    });

    return true;
  } catch (error) {
    console.error('Failed to update Google Calendar event:', error);
    return false;
  }
}