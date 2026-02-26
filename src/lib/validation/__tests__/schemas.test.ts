import { describe, it, expect } from 'vitest';
import {
  signUpSchema,
  loginSchema,
  emailSchema,
  phoneSchema,
  slugSchema,
  timeStringSchema,
  createBookingSchema,
  createEventTypeSchema,
  availabilitySlotSchema,
  dateOverrideSchema,
  createTeamSchema,
  createWebhookSchema,
  rescheduleBookingSchema,
  bulkMemberActionSchema,
} from '../schemas';

// ============================================================================
// EMAIL SCHEMA
// ============================================================================
describe('emailSchema', () => {
  it('accepts valid emails', () => {
    expect(emailSchema.safeParse('user@example.com').success).toBe(true);
    expect(emailSchema.safeParse('a.b+tag@domain.co.uk').success).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
    expect(emailSchema.safeParse('notanemail').success).toBe(false);
    expect(emailSchema.safeParse('@missing-local.com').success).toBe(false);
  });
});

// ============================================================================
// PHONE SCHEMA
// ============================================================================
describe('phoneSchema', () => {
  it('accepts valid E.164 phone numbers', () => {
    expect(phoneSchema.safeParse('+14155551234').success).toBe(true);
    expect(phoneSchema.safeParse('442071234567').success).toBe(true);
  });

  it('accepts null and undefined (optional)', () => {
    expect(phoneSchema.safeParse(null).success).toBe(true);
    expect(phoneSchema.safeParse(undefined).success).toBe(true);
  });

  it('rejects invalid phone numbers', () => {
    expect(phoneSchema.safeParse('abc').success).toBe(false);
    expect(phoneSchema.safeParse('0000').success).toBe(false);
  });
});

// ============================================================================
// SLUG SCHEMA
// ============================================================================
describe('slugSchema', () => {
  it('accepts valid slugs', () => {
    expect(slugSchema.safeParse('my-event').success).toBe(true);
    expect(slugSchema.safeParse('abc').success).toBe(true);
    expect(slugSchema.safeParse('30-minute-meeting').success).toBe(true);
  });

  it('rejects slugs with uppercase or special chars', () => {
    expect(slugSchema.safeParse('My-Event').success).toBe(false);
    expect(slugSchema.safeParse('has space').success).toBe(false);
    expect(slugSchema.safeParse('has_underscore').success).toBe(false);
  });

  it('rejects slugs that are too short or too long', () => {
    expect(slugSchema.safeParse('ab').success).toBe(false);
    expect(slugSchema.safeParse('a'.repeat(51)).success).toBe(false);
  });
});

// ============================================================================
// TIME STRING SCHEMA
// ============================================================================
describe('timeStringSchema', () => {
  it('accepts valid HH:mm times', () => {
    expect(timeStringSchema.safeParse('09:00').success).toBe(true);
    expect(timeStringSchema.safeParse('23:59').success).toBe(true);
    expect(timeStringSchema.safeParse('00:00').success).toBe(true);
  });

  it('rejects invalid times', () => {
    expect(timeStringSchema.safeParse('24:00').success).toBe(false);
    expect(timeStringSchema.safeParse('9:00').success).toBe(false);
    expect(timeStringSchema.safeParse('09:60').success).toBe(false);
    expect(timeStringSchema.safeParse('noon').success).toBe(false);
  });
});

// ============================================================================
// SIGN UP SCHEMA
// ============================================================================
describe('signUpSchema', () => {
  const validData = {
    email: 'user@example.com',
    password: 'Password1',
    name: 'John Doe',
  };

  it('accepts valid sign-up data', () => {
    expect(signUpSchema.safeParse(validData).success).toBe(true);
  });

  it('rejects weak passwords (no uppercase)', () => {
    expect(signUpSchema.safeParse({ ...validData, password: 'password1' }).success).toBe(false);
  });

  it('rejects weak passwords (no lowercase)', () => {
    expect(signUpSchema.safeParse({ ...validData, password: 'PASSWORD1' }).success).toBe(false);
  });

  it('rejects weak passwords (no number)', () => {
    expect(signUpSchema.safeParse({ ...validData, password: 'PasswordOnly' }).success).toBe(false);
  });

  it('rejects short passwords', () => {
    expect(signUpSchema.safeParse({ ...validData, password: 'Abc1' }).success).toBe(false);
  });

  it('rejects short names', () => {
    expect(signUpSchema.safeParse({ ...validData, name: 'J' }).success).toBe(false);
  });
});

// ============================================================================
// LOGIN SCHEMA
// ============================================================================
describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('rejects missing password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });

  it('rejects invalid email', () => {
    expect(loginSchema.safeParse({ email: 'invalid', password: 'x' }).success).toBe(false);
  });
});

// ============================================================================
// CREATE BOOKING SCHEMA
// ============================================================================
describe('createBookingSchema', () => {
  const validBooking = {
    eventTypeId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
    startTime: '2026-03-15T10:00:00.000Z',
    timezone: 'America/New_York',
    name: 'Jane Doe',
    email: 'jane@example.com',
  };

  it('accepts a valid booking', () => {
    expect(createBookingSchema.safeParse(validBooking).success).toBe(true);
  });

  it('accepts booking with optional fields', () => {
    const result = createBookingSchema.safeParse({
      ...validBooking,
      phone: '+14155551234',
      notes: 'Looking forward to it',
      responses: { question1: 'answer1' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects booking without name', () => {
    const { name, ...noName } = validBooking;
    expect(createBookingSchema.safeParse(noName).success).toBe(false);
  });

  it('rejects booking without email', () => {
    const { email, ...noEmail } = validBooking;
    expect(createBookingSchema.safeParse(noEmail).success).toBe(false);
  });

  it('rejects booking with invalid eventTypeId', () => {
    expect(
      createBookingSchema.safeParse({ ...validBooking, eventTypeId: 'bad-id' }).success
    ).toBe(false);
  });

  it('rejects booking with invalid startTime', () => {
    expect(
      createBookingSchema.safeParse({ ...validBooking, startTime: 'not-a-date' }).success
    ).toBe(false);
  });
});

// ============================================================================
// CREATE EVENT TYPE SCHEMA
// ============================================================================
describe('createEventTypeSchema', () => {
  const validEvent = {
    title: 'Quick Chat',
    slug: 'quick-chat',
    length: 30,
  };

  it('accepts minimal valid event type', () => {
    expect(createEventTypeSchema.safeParse(validEvent).success).toBe(true);
  });

  it('rejects duration less than 5 minutes', () => {
    expect(createEventTypeSchema.safeParse({ ...validEvent, length: 3 }).success).toBe(false);
  });

  it('rejects duration over 24 hours', () => {
    expect(createEventTypeSchema.safeParse({ ...validEvent, length: 1441 }).success).toBe(false);
  });

  it('rejects empty title', () => {
    expect(createEventTypeSchema.safeParse({ ...validEvent, title: '' }).success).toBe(false);
  });
});

// ============================================================================
// AVAILABILITY SLOT SCHEMA
// ============================================================================
describe('availabilitySlotSchema', () => {
  it('accepts valid slot', () => {
    expect(
      availabilitySlotSchema.safeParse({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }).success
    ).toBe(true);
  });

  it('rejects start time after end time', () => {
    expect(
      availabilitySlotSchema.safeParse({ dayOfWeek: 1, startTime: '17:00', endTime: '09:00' }).success
    ).toBe(false);
  });

  it('rejects invalid day of week', () => {
    expect(
      availabilitySlotSchema.safeParse({ dayOfWeek: 7, startTime: '09:00', endTime: '17:00' }).success
    ).toBe(false);
  });
});

// ============================================================================
// DATE OVERRIDE SCHEMA
// ============================================================================
describe('dateOverrideSchema', () => {
  it('accepts a day off', () => {
    expect(
      dateOverrideSchema.safeParse({ date: '2026-12-25', isWorking: false }).success
    ).toBe(true);
  });

  it('accepts a working override with times', () => {
    expect(
      dateOverrideSchema.safeParse({
        date: '2026-12-26',
        isWorking: true,
        startTime: '10:00',
        endTime: '14:00',
      }).success
    ).toBe(true);
  });

  it('rejects working day without times', () => {
    expect(
      dateOverrideSchema.safeParse({ date: '2026-12-26', isWorking: true }).success
    ).toBe(false);
  });
});

// ============================================================================
// CREATE TEAM SCHEMA
// ============================================================================
describe('createTeamSchema', () => {
  it('accepts valid team', () => {
    expect(
      createTeamSchema.safeParse({ name: 'Engineering', slug: 'engineering' }).success
    ).toBe(true);
  });

  it('rejects empty name', () => {
    expect(
      createTeamSchema.safeParse({ name: '', slug: 'eng' }).success
    ).toBe(false);
  });
});

// ============================================================================
// CREATE WEBHOOK SCHEMA
// ============================================================================
describe('createWebhookSchema', () => {
  it('accepts valid HTTPS webhook', () => {
    expect(
      createWebhookSchema.safeParse({
        url: 'https://example.com/webhook',
        eventTriggers: ['booking.created'],
      }).success
    ).toBe(true);
  });

  it('rejects HTTP webhook', () => {
    expect(
      createWebhookSchema.safeParse({
        url: 'http://example.com/webhook',
        eventTriggers: ['booking.created'],
      }).success
    ).toBe(false);
  });

  it('rejects localhost webhook', () => {
    expect(
      createWebhookSchema.safeParse({
        url: 'https://localhost/webhook',
        eventTriggers: ['booking.created'],
      }).success
    ).toBe(false);
  });

  it('rejects private IP webhook', () => {
    expect(
      createWebhookSchema.safeParse({
        url: 'https://192.168.1.1/webhook',
        eventTriggers: ['booking.created'],
      }).success
    ).toBe(false);
  });

  it('rejects empty event triggers', () => {
    expect(
      createWebhookSchema.safeParse({
        url: 'https://example.com/webhook',
        eventTriggers: [],
      }).success
    ).toBe(false);
  });
});

// ============================================================================
// RESCHEDULE BOOKING SCHEMA
// ============================================================================
describe('rescheduleBookingSchema', () => {
  it('accepts valid reschedule', () => {
    expect(
      rescheduleBookingSchema.safeParse({
        newStartTime: '2026-03-20T14:00:00.000Z',
        reason: 'Conflict with another meeting',
      }).success
    ).toBe(true);
  });

  it('accepts without reason', () => {
    expect(
      rescheduleBookingSchema.safeParse({
        newStartTime: '2026-03-20T14:00:00.000Z',
      }).success
    ).toBe(true);
  });
});

// ============================================================================
// BULK MEMBER ACTION SCHEMA
// ============================================================================
describe('bulkMemberActionSchema', () => {
  it('accepts valid role change', () => {
    expect(
      bulkMemberActionSchema.safeParse({
        action: 'change_role',
        memberIds: ['id1'],
        role: 'ADMIN',
      }).success
    ).toBe(true);
  });

  it('rejects change_role without role', () => {
    expect(
      bulkMemberActionSchema.safeParse({
        action: 'change_role',
        memberIds: ['id1'],
      }).success
    ).toBe(false);
  });

  it('accepts remove without role', () => {
    expect(
      bulkMemberActionSchema.safeParse({
        action: 'remove',
        memberIds: ['id1', 'id2'],
      }).success
    ).toBe(true);
  });
});
