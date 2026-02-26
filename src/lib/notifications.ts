import prisma from '@/lib/prisma';

export type NotificationType =
  | 'BOOKING_CREATED'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_REMINDER'
  | 'TEAM_MEMBER_ADDED'
  | 'TEAM_INVITATION_RECEIVED';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      bookingId: params.bookingId ?? null,
    },
  });
}

export function buildBookingNotification(
  type: NotificationType,
  data: {
    inviteeName: string;
    eventTitle: string;
    startTime: string;
  }
): { title: string; message: string } {
  switch (type) {
    case 'BOOKING_CREATED':
      return {
        title: 'New booking received',
        message: `${data.inviteeName} booked "${data.eventTitle}" on ${data.startTime}`,
      };
    case 'BOOKING_CONFIRMED':
      return {
        title: 'Booking confirmed',
        message: `"${data.eventTitle}" with ${data.inviteeName} on ${data.startTime} has been confirmed`,
      };
    case 'BOOKING_REJECTED':
      return {
        title: 'Booking rejected',
        message: `"${data.eventTitle}" with ${data.inviteeName} on ${data.startTime} has been rejected`,
      };
    case 'BOOKING_CANCELLED':
      return {
        title: 'Booking cancelled',
        message: `"${data.eventTitle}" with ${data.inviteeName} on ${data.startTime} has been cancelled`,
      };
    case 'BOOKING_RESCHEDULED':
      return {
        title: 'Booking rescheduled',
        message: `"${data.eventTitle}" with ${data.inviteeName} has been rescheduled to ${data.startTime}`,
      };
    case 'BOOKING_REMINDER':
      return {
        title: 'Upcoming meeting',
        message: `"${data.eventTitle}" with ${data.inviteeName} starts at ${data.startTime}`,
      };
    default:
      return {
        title: 'Notification',
        message: '',
      };
  }
}

export function buildTeamNotification(
  type: 'TEAM_MEMBER_ADDED' | 'TEAM_INVITATION_RECEIVED',
  data: { teamName: string; actorName: string; role?: string }
): { title: string; message: string } {
  switch (type) {
    case 'TEAM_MEMBER_ADDED':
      return {
        title: 'Added to team',
        message: `You were added to "${data.teamName}" by ${data.actorName}${data.role ? ` as ${data.role}` : ''}`,
      };
    case 'TEAM_INVITATION_RECEIVED':
      return {
        title: 'Team invitation',
        message: `${data.actorName} invited you to join "${data.teamName}"${data.role ? ` as ${data.role}` : ''}`,
      };
  }
}
