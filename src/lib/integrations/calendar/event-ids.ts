/**
 * Multi-calendar event ID helpers
 *
 * Bookings store calendar event IDs in two fields:
 * - calendarEventId: legacy single string (deprecated, kept for backwards compat)
 * - calendarEventIds: JSON object { "GOOGLE": "id", "OUTLOOK": "id" }
 *
 * These helpers handle reading/writing both fields transparently.
 */

import prisma from '@/lib/prisma';
import { deleteGoogleCalendarEvent, updateGoogleCalendarEvent } from './google';
import { deleteOutlookCalendarEvent, updateOutlookCalendarEvent } from './outlook';

type CalendarProvider = 'GOOGLE' | 'OUTLOOK';

export type CalendarEventIds = Partial<Record<CalendarProvider, string>>;

/**
 * Parse calendar event IDs from a booking record.
 * Handles both legacy (single string) and new (JSON) formats.
 */
export function parseCalendarEventIds(
  calendarEventId: string | null | undefined,
  calendarEventIds: unknown
): CalendarEventIds {
  // Prefer new JSON field
  if (calendarEventIds && typeof calendarEventIds === 'object' && !Array.isArray(calendarEventIds)) {
    return calendarEventIds as CalendarEventIds;
  }

  // Fall back to legacy field — assume it's a Google event ID (original behavior)
  if (calendarEventId) {
    return { GOOGLE: calendarEventId };
  }

  return {};
}

/**
 * Check if any calendar events exist for a booking.
 */
export function hasCalendarEvents(
  calendarEventId: string | null | undefined,
  calendarEventIds: unknown
): boolean {
  const ids = parseCalendarEventIds(calendarEventId, calendarEventIds);
  return Object.keys(ids).length > 0;
}

/**
 * Build Prisma update data for setting calendar event IDs.
 * Sets both fields for backwards compatibility.
 */
export function buildCalendarEventIdsUpdate(ids: CalendarEventIds): {
  calendarEventId: string | null;
  calendarEventIds: CalendarEventIds;
} {
  // Use the first available ID for the legacy field
  const firstId = ids.GOOGLE || ids.OUTLOOK || null;
  return {
    calendarEventId: firstId,
    calendarEventIds: ids,
  };
}

/**
 * Delete calendar events from ALL calendars for a booking.
 * Uses the calendar owner (meeting organizer or host) to find calendars.
 *
 * @param calendarOwnerId - userId whose calendars have the events
 * @param calendarEventId - legacy single event ID field
 * @param calendarEventIds - new multi-calendar JSON field
 * @param options.sync - if true, await deletions; if false, fire-and-forget
 */
export async function deleteAllCalendarEvents(
  calendarOwnerId: string,
  calendarEventId: string | null | undefined,
  calendarEventIds: unknown,
  options: { sync?: boolean } = {}
): Promise<void> {
  const ids = parseCalendarEventIds(calendarEventId, calendarEventIds);
  if (Object.keys(ids).length === 0) return;

  const calendars = await prisma.calendar.findMany({
    where: { userId: calendarOwnerId, isEnabled: true },
  });

  for (const cal of calendars) {
    const eventId = ids[cal.provider as CalendarProvider];
    if (!eventId) continue;

    const deletePromise = (async () => {
      try {
        if (cal.provider === 'GOOGLE') {
          await deleteGoogleCalendarEvent(cal.id, eventId);
        } else if (cal.provider === 'OUTLOOK') {
          await deleteOutlookCalendarEvent(cal.id, eventId);
        }
      } catch (error) {
        console.error(`Failed to delete ${cal.provider} calendar event ${eventId}:`, error);
      }
    })();

    if (options.sync) {
      await deletePromise;
    } else {
      deletePromise.catch(console.error);
    }
  }
}

/**
 * Update calendar events on ALL calendars for a booking (e.g., reschedule).
 */
export async function updateAllCalendarEvents(
  calendarOwnerId: string,
  calendarEventId: string | null | undefined,
  calendarEventIds: unknown,
  updates: { startTime: Date; endTime: Date }
): Promise<void> {
  const ids = parseCalendarEventIds(calendarEventId, calendarEventIds);
  if (Object.keys(ids).length === 0) return;

  const calendars = await prisma.calendar.findMany({
    where: { userId: calendarOwnerId, isEnabled: true },
  });

  for (const cal of calendars) {
    const eventId = ids[cal.provider as CalendarProvider];
    if (!eventId) continue;

    try {
      if (cal.provider === 'GOOGLE') {
        await updateGoogleCalendarEvent(cal.id, eventId, updates);
      } else if (cal.provider === 'OUTLOOK') {
        await updateOutlookCalendarEvent(cal.id, eventId, updates);
      }
    } catch (error) {
      console.error(`Failed to update ${cal.provider} calendar event ${eventId}:`, error);
    }
  }
}
