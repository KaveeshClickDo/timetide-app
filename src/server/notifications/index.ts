import prisma from '@/server/db/prisma';
import type { NotificationType, CreateNotificationParams } from '@/types/notification';

export type { NotificationType };

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

export function buildPlanNotification(
  type: NotificationType,
  data: {
    plan?: string;
    expiresAt?: string;
    gracePeriodEndsAt?: string;
    cleanupScheduledAt?: string;
    daysLeft?: number;
    lockedEvents?: number;
    lockedWebhooks?: number;
  }
): { title: string; message: string } {
  switch (type) {
    case 'PLAN_EXPIRING_SOON':
      return {
        title: 'Plan expiring soon',
        message: `Your ${data.plan} plan expires on ${data.expiresAt}. Renew to keep your features.`,
      };
    case 'PLAN_GRACE_PERIOD_STARTED':
      return {
        title: 'Billing period ended',
        message: `Your billing period has ended. You have 7 days to renew before your ${data.plan} features are locked.`,
      };
    case 'PLAN_GRACE_PERIOD_ENDING':
      return {
        title: 'Grace period ending soon',
        message: `Your grace period ends ${data.daysLeft === 1 ? 'tomorrow' : `in ${data.daysLeft} days`}. Renew now or your features will be locked.`,
      };
    case 'PLAN_LOCKED':
      return {
        title: `${data.plan || 'PRO'} features locked`,
        message: `${data.lockedEvents ?? 0} event type(s) and ${data.lockedWebhooks ?? 0} webhook(s) have been deactivated. Upgrade to reactivate them.`,
      };
    case 'PLAN_CLEANUP_WARNING':
      return {
        title: 'Plan update',
        message: 'Your subscription status has changed. Check your billing page for details.',
      };
    case 'PLAN_DOWNGRADED':
      return {
        title: 'Plan downgraded',
        message: `Your plan has been changed to FREE. PRO features are no longer available.`,
      };
    case 'PLAN_REACTIVATED':
      return {
        title: 'Subscription reactivated',
        message: `Your ${data.plan} features have been restored. All locked resources are now active again.`,
      };
    default:
      return {
        title: 'Plan update',
        message: 'Your subscription status has changed.',
      };
  }
}
