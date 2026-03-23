import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BookingEmailData, RecurringBookingEmailData, TeamEmailData } from '@/types/email';

// ============================================================================
// Mock all external dependencies
// ============================================================================

// vi.hoisted runs before hoisted vi.mock calls, so mocks are available in factories
const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/server/integrations/email/client', () => ({
  sendEmail: sendEmailMock,
  generateBookingConfirmedEmail: vi.fn().mockReturnValue('<html>confirmed</html>'),
  generateBookingCancelledEmail: vi.fn().mockReturnValue('<html>cancelled</html>'),
  generateBookingPendingEmail: vi.fn().mockReturnValue('<html>pending</html>'),
  generateBookingConfirmedByHostEmail: vi.fn().mockReturnValue('<html>confirmed-by-host</html>'),
  generateBookingRejectedEmail: vi.fn().mockReturnValue('<html>rejected</html>'),
  generateReminderEmail: vi.fn().mockReturnValue('<html>reminder</html>'),
  generateBookingRescheduledEmail: vi.fn().mockReturnValue('<html>rescheduled</html>'),
  generateRecurringBookingConfirmedEmail: vi.fn().mockReturnValue('<html>recurring</html>'),
  generateBulkConfirmedByHostEmail: vi.fn().mockReturnValue('<html>bulk-confirmed</html>'),
  generateTeamMemberAddedEmail: vi.fn().mockReturnValue('<html>team-added</html>'),
  generateTeamInvitationEmail: vi.fn().mockReturnValue('<html>team-invite</html>'),
}));

// Mock Redis — prevents connection attempts
vi.mock('../redis', () => ({
  redis: null,
  isRedisAvailable: vi.fn().mockResolvedValue(false),
}));

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn(),
  Worker: vi.fn(),
  Job: vi.fn(),
}));

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  queueBookingConfirmationEmails,
  queueBookingCancellationEmails,
  queueBookingPendingEmails,
  queueBookingConfirmedByHostEmail,
  queueBookingRejectedEmail,
  queueReminderEmail,
  queueBookingRescheduledEmails,
  queueRecurringBookingConfirmationEmails,
  queueBulkConfirmedByHostEmail,
  queueTeamMemberAddedEmail,
  queueTeamInvitationEmail,
} from '../email-queue';

// ============================================================================
// Fixtures
// ============================================================================

function makeBookingData(overrides: Partial<BookingEmailData> = {}): BookingEmailData {
  return {
    hostName: 'Alice Host',
    hostEmail: 'alice@host.com',
    hostUsername: 'alice',
    inviteeName: 'Bob Guest',
    inviteeEmail: 'bob@guest.com',
    eventTitle: '30min Meeting',
    eventSlug: '30min-meeting',
    startTime: 'March 10, 2026 10:00 AM',
    endTime: 'March 10, 2026 10:30 AM',
    timezone: 'UTC',
    bookingUid: 'booking-uid-123',
    ...overrides,
  };
}

function makeTeamBookingData(): BookingEmailData {
  return makeBookingData({
    teamMembers: [
      { name: 'Alice Host', email: 'alice@host.com' },
      { name: 'Charlie Member', email: 'charlie@team.com' },
    ],
  });
}

function makeRecurringData(overrides: Partial<RecurringBookingEmailData> = {}): RecurringBookingEmailData {
  return {
    hostName: 'Alice Host',
    hostEmail: 'alice@host.com',
    inviteeName: 'Bob Guest',
    inviteeEmail: 'bob@guest.com',
    eventTitle: 'Weekly Standup',
    startTime: 'March 10, 2026 10:00 AM',
    endTime: 'March 10, 2026 10:30 AM',
    bookingUid: 'uid-1',
    timezone: 'UTC',
    totalOccurrences: 4,
    frequencyLabel: 'weekly',
    recurringDates: [
      { startTime: 'March 10, 2026 10:00 AM', endTime: 'March 10, 2026 10:30 AM' },
      { startTime: 'March 17, 2026 10:00 AM', endTime: 'March 17, 2026 10:30 AM' },
      { startTime: 'March 24, 2026 10:00 AM', endTime: 'March 24, 2026 10:30 AM' },
      { startTime: 'March 31, 2026 10:00 AM', endTime: 'March 31, 2026 10:30 AM' },
    ],
    ...overrides,
  };
}

/** Helper: extract { to, subject, replyTo } from all sendEmail calls */
function getSentEmails() {
  return sendEmailMock.mock.calls.map((call: any) => call[0] as {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  });
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  sendEmailMock.mockClear();
});

// --------------------------------------------------------------------------
// queueBookingConfirmationEmails
// --------------------------------------------------------------------------
describe('queueBookingConfirmationEmails', () => {
  it('sends 2 emails for a solo host (invitee + host)', async () => {
    await queueBookingConfirmationEmails(makeBookingData());

    const emails = getSentEmails();
    expect(emails).toHaveLength(2);

    // Invitee email
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Alice Host');
    expect(emails[0].replyTo).toBe('alice@host.com');

    // Host email
    expect(emails[1].to).toBe('alice@host.com');
    expect(emails[1].subject).toContain('Bob Guest');
    expect(emails[1].replyTo).toBe('bob@guest.com');
  });

  it('sends emails to all team members for collective events', async () => {
    await queueBookingConfirmationEmails(makeTeamBookingData());

    const emails = getSentEmails();
    // 1 invitee + 2 team members = 3
    expect(emails).toHaveLength(3);

    // Invitee email subject lists all team member names
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Alice Host');
    expect(emails[0].subject).toContain('Charlie Member');

    // Team members
    const memberRecipients = [emails[1].to, emails[2].to];
    expect(memberRecipients).toContain('alice@host.com');
    expect(memberRecipients).toContain('charlie@team.com');
  });
});

// --------------------------------------------------------------------------
// queueBookingCancellationEmails
// --------------------------------------------------------------------------
describe('queueBookingCancellationEmails', () => {
  it('host cancels solo → notifies invitee only', async () => {
    await queueBookingCancellationEmails(makeBookingData(), 'Schedule conflict', true);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Alice Host cancelled');
  });

  it('host cancels team event → notifies invitee with all member names', async () => {
    await queueBookingCancellationEmails(makeTeamBookingData(), 'Conflict', true);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Alice Host, Charlie Member cancelled');
  });

  it('invitee cancels solo → notifies host', async () => {
    await queueBookingCancellationEmails(makeBookingData(), "Can't make it", false);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('alice@host.com');
    expect(emails[0].subject).toContain('Bob Guest cancelled');
  });

  it('invitee cancels team event → notifies all team members', async () => {
    await queueBookingCancellationEmails(makeTeamBookingData(), "Can't attend", false);

    const emails = getSentEmails();
    expect(emails).toHaveLength(2);

    const recipients = emails.map((e) => e.to);
    expect(recipients).toContain('alice@host.com');
    expect(recipients).toContain('charlie@team.com');

    // All subjects mention the invitee
    emails.forEach((e) => {
      expect(e.subject).toContain('Bob Guest cancelled');
    });
  });

  it('defaults cancelledByHost to false when not provided', async () => {
    await queueBookingCancellationEmails(makeBookingData());

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('alice@host.com'); // invitee-cancelled → host notified
  });
});

// --------------------------------------------------------------------------
// queueBookingRescheduledEmails
// --------------------------------------------------------------------------
describe('queueBookingRescheduledEmails', () => {
  const oldTime = { start: 'March 10, 2026 9:00 AM', end: 'March 10, 2026 9:30 AM' };
  const hostOldTime = { start: '2026-03-10T09:00:00Z', end: '2026-03-10T09:30:00Z' };

  it('invitee reschedules solo → notifies both invitee and host', async () => {
    await queueBookingRescheduledEmails(makeBookingData(), oldTime, hostOldTime, false);

    const emails = getSentEmails();
    expect(emails).toHaveLength(2);

    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Rescheduled');

    expect(emails[1].to).toBe('alice@host.com');
    expect(emails[1].subject).toContain('Bob Guest changed time');
  });

  it('host reschedules solo → only notifies invitee', async () => {
    await queueBookingRescheduledEmails(makeBookingData(), oldTime, hostOldTime, true);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
  });

  it('invitee reschedules team event → notifies invitee + all team members', async () => {
    await queueBookingRescheduledEmails(makeTeamBookingData(), oldTime, hostOldTime, false);

    const emails = getSentEmails();
    // 1 invitee + 2 team members = 3
    expect(emails).toHaveLength(3);

    // Invitee gets team member names in subject
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Alice Host, Charlie Member');

    // Each team member notified
    const memberRecipients = [emails[1].to, emails[2].to];
    expect(memberRecipients).toContain('alice@host.com');
    expect(memberRecipients).toContain('charlie@team.com');
  });

  it('host reschedules team event → only notifies invitee', async () => {
    await queueBookingRescheduledEmails(makeTeamBookingData(), oldTime, hostOldTime, true);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
  });
});

// --------------------------------------------------------------------------
// queueBookingConfirmedByHostEmail
// --------------------------------------------------------------------------
describe('queueBookingConfirmedByHostEmail', () => {
  it('sends to invitee with solo host name', async () => {
    await queueBookingConfirmedByHostEmail(makeBookingData());

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Alice Host');
    expect(emails[0].subject).not.toContain('Charlie');
  });

  it('uses team member names in subject for collective events', async () => {
    await queueBookingConfirmedByHostEmail(makeTeamBookingData());

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toContain('Alice Host, Charlie Member');
  });
});

// --------------------------------------------------------------------------
// queueBookingRejectedEmail
// --------------------------------------------------------------------------
describe('queueBookingRejectedEmail', () => {
  it('sends to invitee with solo host name', async () => {
    await queueBookingRejectedEmail(makeBookingData(), 'Not available');

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Declined');
    expect(emails[0].subject).toContain('Alice Host');
  });

  it('uses team member names in subject for collective events', async () => {
    await queueBookingRejectedEmail(makeTeamBookingData());

    const emails = getSentEmails();
    expect(emails[0].subject).toContain('Alice Host, Charlie Member');
  });
});

// --------------------------------------------------------------------------
// queueBookingPendingEmails
// --------------------------------------------------------------------------
describe('queueBookingPendingEmails', () => {
  it('sends 2 emails (invitee + host)', async () => {
    await queueBookingPendingEmails(makeBookingData());

    const emails = getSentEmails();
    expect(emails).toHaveLength(2);

    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('Pending');

    expect(emails[1].to).toBe('alice@host.com');
    expect(emails[1].subject).toContain('Action Required');
    expect(emails[1].subject).toContain('Bob Guest');
  });
});

// --------------------------------------------------------------------------
// queueReminderEmail
// --------------------------------------------------------------------------
describe('queueReminderEmail', () => {
  it('sends to invitee by default with host name in subject', async () => {
    await queueReminderEmail(makeBookingData(), 24);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('24 hours');
    expect(emails[0].subject).toContain('Alice Host');
  });

  it('uses singular "1 hour" for 1-hour reminder', async () => {
    await queueReminderEmail(makeBookingData(), 1);

    const emails = getSentEmails();
    expect(emails[0].subject).toContain('1 hour');
    expect(emails[0].subject).not.toContain('1 hours');
  });

  it('sends to host when toOverride is host email', async () => {
    await queueReminderEmail(makeBookingData(), 24, 'alice@host.com');

    const emails = getSentEmails();
    expect(emails[0].to).toBe('alice@host.com');
    expect(emails[0].subject).toContain('Bob Guest'); // host sees invitee name
    expect(emails[0].replyTo).toBe('bob@guest.com');
  });
});

// --------------------------------------------------------------------------
// queueRecurringBookingConfirmationEmails
// --------------------------------------------------------------------------
describe('queueRecurringBookingConfirmationEmails', () => {
  it('sends 2 emails (invitee + host) with occurrence details', async () => {
    await queueRecurringBookingConfirmationEmails(makeRecurringData());

    const emails = getSentEmails();
    expect(emails).toHaveLength(2);

    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('4');
    expect(emails[0].subject).toContain('weekly');

    expect(emails[1].to).toBe('alice@host.com');
    expect(emails[1].subject).toContain('4 sessions');
  });
});

// --------------------------------------------------------------------------
// queueBulkConfirmedByHostEmail
// --------------------------------------------------------------------------
describe('queueBulkConfirmedByHostEmail', () => {
  it('sends to invitee with occurrence count', async () => {
    await queueBulkConfirmedByHostEmail(makeRecurringData());

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('bob@guest.com');
    expect(emails[0].subject).toContain('All 4 sessions');
  });
});

// --------------------------------------------------------------------------
// queueTeamMemberAddedEmail
// --------------------------------------------------------------------------
describe('queueTeamMemberAddedEmail', () => {
  it('sends team member added notification', async () => {
    const teamData: TeamEmailData = {
      memberName: 'Charlie Team',
      teamName: 'Engineering',
      actorName: 'Alice Host',
      role: 'MEMBER',
      teamUrl: 'https://timetide.app/team/engineering',
    };
    await queueTeamMemberAddedEmail('charlie@team.com', teamData);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('charlie@team.com');
    expect(emails[0].subject).toContain('Engineering');
  });
});

// --------------------------------------------------------------------------
// queueTeamInvitationEmail
// --------------------------------------------------------------------------
describe('queueTeamInvitationEmail', () => {
  it('sends team invitation email', async () => {
    const teamData: TeamEmailData & { expiresIn: string; acceptUrl: string } = {
      memberName: 'Dave Team',
      teamName: 'Design',
      actorName: 'Alice Host',
      role: 'MEMBER',
      teamUrl: 'https://timetide.app/team/design',
      expiresIn: '7 days',
      acceptUrl: 'https://timetide.app/invite/abc123',
    };
    await queueTeamInvitationEmail('dave@team.com', teamData);

    const emails = getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe('dave@team.com');
    expect(emails[0].subject).toContain('Design');
  });
});
