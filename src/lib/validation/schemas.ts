/**
 * TimeTide Validation Schemas
 * Using Zod for runtime validation of all inputs
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Time must be in HH:mm format');

export const timezoneSchema = z.string().min(1, 'Timezone is required');

export const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(50, 'Slug must be less than 50 characters')
  .regex(
    /^[a-z0-9-]+$/,
    'Slug can only contain lowercase letters, numbers, and hyphens'
  );

export const emailSchema = z.string().email('Invalid email address');

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number')
  .optional()
  .nullable();

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain uppercase, lowercase, and a number'
    ),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  username: slugSchema.optional(),
  timezone: timezoneSchema.optional(),
  timezoneAutoDetect: z.boolean().optional(),
  image: z.string().url().optional().nullable(),
});

// ============================================================================
// EVENT TYPE SCHEMAS
// ============================================================================

export const locationTypeSchema = z.enum([
  'IN_PERSON',
  'PHONE',
  'GOOGLE_MEET',
  'ZOOM',
  'TEAMS',
  'CUSTOM',
]);

export const schedulingTypeSchema = z.enum([
  'ROUND_ROBIN',
  'COLLECTIVE',
  'MANAGED',
]);

export const periodTypeSchema = z.enum(['ROLLING', 'RANGE', 'UNLIMITED']);

export const questionTypeSchema = z.enum([
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'SELECT',
  'MULTISELECT',
  'CHECKBOX',
  'PHONE',
  'EMAIL',
]);

export const eventTypeQuestionSchema = z.object({
  type: questionTypeSchema,
  label: z.string().min(1, 'Label is required').max(200),
  placeholder: z.string().max(200).optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(), // For SELECT/MULTISELECT
  order: z.number().int().min(0).default(0),
});

export const createEventTypeSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  slug: slugSchema,
  description: z.string().max(1000).optional(),
  length: z
    .number()
    .int()
    .min(5, 'Duration must be at least 5 minutes')
    .max(1440, 'Duration cannot exceed 24 hours'),
  
  // Scheduling settings
  bufferTimeBefore: z.number().int().min(0).max(120).default(0),
  bufferTimeAfter: z.number().int().min(0).max(120).default(0),
  minimumNotice: z.number().int().min(0).max(43200).default(60), // Max 30 days
  slotInterval: z.number().int().min(5).max(120).optional(),
  
  // Booking window
  periodType: periodTypeSchema.default('ROLLING'),
  periodDays: z.number().int().min(1).max(365).optional(),
  periodStartDate: z.string().datetime().optional(),
  periodEndDate: z.string().datetime().optional(),
  
  // Location
  locationType: locationTypeSchema.default('GOOGLE_MEET'),
  locationValue: z.string().max(500).optional(),
  
  // Availability
  scheduleId: z.string().cuid().optional(),
  
  // Limits
  maxBookingsPerDay: z.number().int().min(1).max(100).optional(),
  seatsPerSlot: z.number().int().min(1).max(100).default(1),
  
  // Customization
  requiresConfirmation: z.boolean().default(false),
  hideNotes: z.boolean().default(false),
  successRedirectUrl: z.string().url().optional(),
  
  // Team settings
  teamId: z.string().cuid().optional(),
  schedulingType: schedulingTypeSchema.optional(),
  
  // Questions
  questions: z.array(eventTypeQuestionSchema).max(20).optional(),
});

export const updateEventTypeSchema = createEventTypeSchema.partial();

// ============================================================================
// AVAILABILITY SCHEMAS
// ============================================================================

export const availabilitySlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
}).refine(
  (data) => data.startTime < data.endTime,
  { message: 'Start time must be before end time' }
);

export const dateOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  isWorking: z.boolean(),
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.optional(),
}).refine(
  (data) => !data.isWorking || (data.startTime && data.endTime),
  { message: 'Working days must have start and end times' }
).refine(
  (data) => !data.startTime || !data.endTime || data.startTime < data.endTime,
  { message: 'Start time must be before end time' }
);

export const createAvailabilityScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  timezone: timezoneSchema,
  isDefault: z.boolean().default(false),
  slots: z.array(availabilitySlotSchema).min(1, 'At least one slot is required'),
});

export const updateAvailabilityScheduleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: timezoneSchema.optional(),
  isDefault: z.boolean().optional(),
  slots: z.array(availabilitySlotSchema).optional(),
});

// ============================================================================
// BOOKING SCHEMAS
// ============================================================================

export const createBookingSchema = z.object({
  eventTypeId: z.string().cuid(),
  startTime: z.string().datetime(),
  timezone: timezoneSchema,
  
  // Invitee info
  name: z.string().min(1, 'Name is required').max(100),
  email: emailSchema,
  phone: phoneSchema,
  notes: z.string().max(1000).optional(),
  
  // Custom responses to questions
  responses: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ])).optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const rescheduleBookingSchema = z.object({
  newStartTime: z.string().datetime(),
  reason: z.string().max(500).optional(),
});

// ============================================================================
// TEAM SCHEMAS
// ============================================================================

export const teamRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);

export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
  description: z.string().max(500).optional(),
});

export const updateTeamSchema = createTeamSchema.partial();

export const addTeamMemberSchema = z.object({
  email: emailSchema,
  role: teamRoleSchema.default('MEMBER'),
});

export const updateTeamMemberSchema = z.object({
  role: teamRoleSchema.optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

// ============================================================================
// SLOT QUERY SCHEMAS
// ============================================================================

export const getSlotsQuerySchema = z.object({
  eventTypeId: z.string().cuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: timezoneSchema,
});

// ============================================================================
// WEBHOOK SCHEMAS
// ============================================================================

export const webhookEventSchema = z.enum([
  'booking.created',
  'booking.cancelled',
  'booking.rescheduled',
  'booking.confirmed',
  'booking.rejected',
]);

/** Validate webhook URL is HTTPS and not targeting internal/private networks */
const safeWebhookUrl = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url);
    // Must be HTTPS
    if (parsed.protocol !== 'https:') return false;
    // Block private/internal hostnames
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.') ||
      host === '169.254.169.254' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) return false;
    return true;
  } catch {
    return false;
  }
}, { message: 'Webhook URL must be a public HTTPS URL' });

export const createWebhookSchema = z.object({
  name: z.string().max(100).optional(),
  url: safeWebhookUrl,
  eventTriggers: z.array(webhookEventSchema).min(1),
  secret: z.string().min(16).max(128).optional(),
});

export const updateWebhookSchema = z.object({
  name: z.string().max(100).optional().nullable(),
  url: safeWebhookUrl.optional(),
  eventTriggers: z.array(webhookEventSchema).min(1).optional(),
  isActive: z.boolean().optional(),
  regenerateSecret: z.boolean().optional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateEventTypeInput = z.infer<typeof createEventTypeSchema>;
export type UpdateEventTypeInput = z.infer<typeof updateEventTypeSchema>;
export type CreateAvailabilityScheduleInput = z.infer<typeof createAvailabilityScheduleSchema>;
export type UpdateAvailabilityScheduleInput = z.infer<typeof updateAvailabilityScheduleSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;
export type GetSlotsQuery = z.infer<typeof getSlotsQuerySchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
