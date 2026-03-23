/**
 * Personal event type management: list, get, create, update, delete.
 *
 * Handles: plan enforcement (limits, feature gates, subscription lock),
 * slug generation with collision detection, active-event swap on
 * downgrade unlock, questions management, and field whitelisting.
 */

import prisma from '@/server/db/prisma'
import { PLAN_LIMITS, type PlanTier } from '@/lib/pricing'
import { MAX_PAGE_SIZE } from '@/server/api-constants'
import type { QuestionType, LocationType } from '@/generated/prisma/client'

// ── Domain errors ─────────────────────────────────────────────────────────────

export class EventTypeNotFoundError extends Error {
  constructor() {
    super('Event type not found')
    this.name = 'EventTypeNotFoundError'
  }
}

export class EventTypeSubscriptionLockedError extends Error {
  constructor() {
    super('Your subscription has expired. Please renew to create new resources.')
    this.name = 'EventTypeSubscriptionLockedError'
  }
}

export class EventTypeLimitReachedError extends Error {
  limit: number
  constructor(limit: number) {
    super(`Event type limit reached. Upgrade to create more.`)
    this.name = 'EventTypeLimitReachedError'
    this.limit = limit
  }
}

export class EventTypeFeatureDeniedError extends Error {
  feature: string
  constructor(feature: string) {
    super(`${feature} requires a higher plan.`)
    this.name = 'EventTypeFeatureDeniedError'
    this.feature = feature
  }
}

export class EventTypeActiveLimitError extends Error {
  maxEvents: number
  constructor(maxEvents: number) {
    super(
      `Your plan allows ${maxEvents} active event type${maxEvents !== 1 ? 's' : ''}. Deactivate your current active event type first, or upgrade your plan.`
    )
    this.name = 'EventTypeActiveLimitError'
    this.maxEvents = maxEvents
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserPlan(userId: string) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, subscriptionStatus: true },
  })
  return {
    plan: (dbUser?.plan as PlanTier) || 'FREE',
    subscriptionStatus: dbUser?.subscriptionStatus ?? null,
  }
}

function enforceSubscriptionNotLocked(subscriptionStatus: string | null) {
  if (subscriptionStatus === 'LOCKED') {
    throw new EventTypeSubscriptionLockedError()
  }
}

function enforceEventTypeFeatures(plan: PlanTier, data: Record<string, unknown>) {
  const limits = PLAN_LIMITS[plan]

  if (data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
    if (!limits.customQuestions) throw new EventTypeFeatureDeniedError('Custom Questions')
  }
  if (data.seatsPerSlot && (data.seatsPerSlot as number) > 1) {
    if (!limits.groupBooking) throw new EventTypeFeatureDeniedError('Group Booking')
  }
  if (data.requiresConfirmation) {
    if (!limits.customQuestions) throw new EventTypeFeatureDeniedError('Booking Confirmation')
  }
  if (data.successRedirectUrl) {
    if (!limits.customQuestions) throw new EventTypeFeatureDeniedError('Success Redirect URL')
  }
  if (data.allowsRecurring) {
    if (!limits.customQuestions) throw new EventTypeFeatureDeniedError('Recurring Bookings')
  }
}

async function generateUniqueSlug(userId: string, title: string, excludeId?: string) {
  const baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  let slug = baseSlug
  let counter = 1

  while (
    await prisma.eventType.findFirst({
      where: {
        userId,
        slug,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    })
  ) {
    slug = `${baseSlug}-${counter}`
    counter++
  }

  return slug
}

// ── List event types ──────────────────────────────────────────────────────────

export async function listEventTypes(userId: string) {
  return prisma.eventType.findMany({
    where: { userId, teamId: null },
    include: { _count: { select: { bookings: true } } },
    orderBy: { createdAt: 'desc' },
    take: MAX_PAGE_SIZE,
  })
}

// ── Get event type ────────────────────────────────────────────────────────────

export async function getEventType(eventTypeId: string, userId: string) {
  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, userId },
    include: {
      questions: { orderBy: { order: 'asc' } },
      schedule: { include: { slots: true, overrides: true } },
      _count: { select: { bookings: true } },
    },
  })
  if (!eventType) throw new EventTypeNotFoundError()
  return eventType
}

// ── Create event type ─────────────────────────────────────────────────────────

export interface CreateEventTypeInput {
  userId: string
  data: {
    title: string
    description?: string | null
    slug?: string
    length: number
    locationType?: LocationType
    questions?: Array<{
      type: QuestionType
      label: string
      required?: boolean
      placeholder?: string | null
      options?: string[]
      order?: number
    }>
    [key: string]: unknown
  }
}

export async function createEventType(input: CreateEventTypeInput) {
  const { userId, data } = input
  const { plan, subscriptionStatus } = await getUserPlan(userId)

  enforceSubscriptionNotLocked(subscriptionStatus)

  // Enforce event type count limit
  const currentCount = await prisma.eventType.count({ where: { userId } })
  const maxEventTypes = PLAN_LIMITS[plan].maxEventTypes
  if (maxEventTypes !== Infinity && currentCount >= maxEventTypes) {
    throw new EventTypeLimitReachedError(maxEventTypes)
  }

  // Enforce pro feature gates
  enforceEventTypeFeatures(plan, data as Record<string, unknown>)

  const { title, description, slug: _inputSlug, length, locationType, questions, ...rest } = data
  const slug = await generateUniqueSlug(userId, title)

  // Get user's default availability schedule
  const defaultSchedule = await prisma.availabilitySchedule.findFirst({
    where: { userId, isDefault: true },
  })

  const eventType = await prisma.eventType.create({
    data: {
      userId,
      title,
      slug,
      description: description || null,
      length,
      locationType,
      scheduleId: defaultSchedule?.id,
      isActive: true,
      questions: questions
        ? {
            create: questions.map((q, idx) => ({
              order: q.order ?? idx,
              label: q.label,
              type: q.type,
              required: q.required ?? false,
              placeholder: q.placeholder ?? null,
              options: q.options ?? undefined,
            })),
          }
        : undefined,
      ...rest,
    },
  })

  return eventType
}

// ── Update event type ─────────────────────────────────────────────────────────

export interface UpdateEventTypeInput {
  eventTypeId: string
  userId: string
  data: Record<string, unknown>
}

export async function updateEventType(input: UpdateEventTypeInput) {
  const { eventTypeId, userId, data } = input

  const existing = await prisma.eventType.findFirst({
    where: { id: eventTypeId, userId },
  })
  if (!existing) throw new EventTypeNotFoundError()

  const { plan } = await getUserPlan(userId)

  // Allow LOCKED users to edit basic fields and toggle active/inactive
  // so the lock-and-swap system works after downgrade. Pro features are
  // still blocked by enforceEventTypeFeatures based on the plan.
  enforceEventTypeFeatures(plan, data)

  // Enforce active-event limit
  if (data.isActive === true && !existing.isActive) {
    const maxEvents = PLAN_LIMITS[plan].maxEventTypes
    if (maxEvents !== Infinity) {
      const activeEvents = await prisma.eventType.findMany({
        where: { userId, isActive: true, id: { not: eventTypeId } },
        orderBy: { updatedAt: 'asc' },
        select: { id: true },
      })
      if (activeEvents.length >= maxEvents) {
        // If activating a locked-by-downgrade event, auto-swap: deactivate the oldest active event
        if (existing.lockedByDowngrade) {
          const toDeactivate = activeEvents.slice(0, activeEvents.length - maxEvents + 1)
          await prisma.eventType.updateMany({
            where: { id: { in: toDeactivate.map((e) => e.id) } },
            data: { isActive: false },
          })
        } else {
          throw new EventTypeActiveLimitError(maxEvents)
        }
      }
    }
  }

  // Handle slug update when title changes
  let newSlug = existing.slug
  if (data.title && data.title !== existing.title) {
    newSlug = await generateUniqueSlug(userId, data.title as string, eventTypeId)
  }

  const { questions } = data

  // Whitelist allowed fields to prevent mass assignment
  const allowedFields = [
    'title', 'description', 'length', 'locationType', 'locationValue',
    'isActive', 'requiresConfirmation', 'allowsRecurring', 'recurringMaxWeeks', 'recurringFrequency', 'recurringInterval',
    'minimumNotice', 'bufferTimeBefore', 'bufferTimeAfter', 'maxBookingsPerDay',
    'scheduleId', 'color', 'periodType', 'periodDays', 'periodStartDate',
    'periodEndDate', 'seatsPerSlot', 'slotInterval', 'hideNotes', 'successRedirectUrl',
  ] as const
  const updateData: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if ((data as any)[field] !== undefined) {
      updateData[field] = (data as any)[field]
    }
  }

  // When activating a downgrade-locked event, clear the lock flag
  if (data.isActive === true && existing.lockedByDowngrade) {
    updateData.lockedByDowngrade = false
  }

  const eventType = await prisma.eventType.update({
    where: { id: eventTypeId },
    data: { ...updateData, slug: newSlug },
  })

  // Handle questions update if provided
  if (questions !== undefined) {
    await prisma.eventTypeQuestion.deleteMany({ where: { eventTypeId } })
    if (Array.isArray(questions) && questions.length > 0) {
      await prisma.eventTypeQuestion.createMany({
        data: (questions as any[]).map((q, index) => ({
          eventTypeId,
          type: q.type as QuestionType,
          label: q.label,
          required: q.required ?? false,
          placeholder: q.placeholder,
          options: q.options,
          order: index,
        })),
      })
    }
  }

  return eventType
}

// ── Delete event type ─────────────────────────────────────────────────────────

export async function deleteEventType(eventTypeId: string, userId: string) {
  const existing = await prisma.eventType.findFirst({
    where: { id: eventTypeId, userId },
  })
  if (!existing) throw new EventTypeNotFoundError()

  await prisma.eventTypeQuestion.deleteMany({ where: { eventTypeId } })
  await prisma.eventTypeAssignment.deleteMany({ where: { eventTypeId } })
  await prisma.eventType.delete({ where: { id: eventTypeId } })
}
