/**
 * Team Slot Calculator
 *
 * Handles slot calculation for team event types with three scheduling modes:
 * - ROUND_ROBIN: Rotates assignments among team members
 * - COLLECTIVE: All members must be available simultaneously
 * - MANAGED: Host assigns members manually after booking
 */

import { addDays, format, parseISO } from 'date-fns';
import prisma from '@/lib/prisma';
import {
  SlotCalculator,
  SlotCalculatorOptions,
  CalculatedSlots,
  TimeSlot,
  BusyTime,
  mergeBusyTimes,
  AvailabilityWindow,
  DateOverride,
} from './calculator';
import { getAllBusyTimes } from '@/lib/calendar/google';
import { getOutlookBusyTimes } from '@/lib/calendar/outlook';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamMemberInfo {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  timezone: string;
  priority: number;
  isActive: boolean;
}

export interface TeamSlotWithAssignment {
  start: Date;
  end: Date;
  assignedMemberId?: string;
  assignedMemberName?: string;
  availableMembers?: TeamMemberInfo[]; // For MANAGED type
}

export interface TeamCalculatedSlots {
  [date: string]: TeamSlotWithAssignment[];
}

export interface TeamSlotCalculatorResult {
  slots: TeamCalculatedSlots;
  schedulingType: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED';
  members: TeamMemberInfo[];
  lastAssignedMemberId?: string;
}

interface MemberAvailabilityData {
  member: TeamMemberInfo;
  availability: AvailabilityWindow[];
  dateOverrides: DateOverride[];
  busyTimes: BusyTime[];
}

// ============================================================================
// TEAM SLOT CALCULATOR
// ============================================================================

export class TeamSlotCalculator {
  private eventTypeId: string;
  private teamId: string;
  private schedulingType: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED';
  private lastAssignedMemberId?: string;

  constructor(
    eventTypeId: string,
    teamId: string,
    schedulingType: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED',
    lastAssignedMemberId?: string
  ) {
    this.eventTypeId = eventTypeId;
    this.teamId = teamId;
    this.schedulingType = schedulingType;
    this.lastAssignedMemberId = lastAssignedMemberId;
  }

  /**
   * Calculate available slots for the team event type
   */
  async calculate(options: {
    duration: number;
    bufferBefore: number;
    bufferAfter: number;
    slotInterval?: number;
    minimumNotice: number;
    maxDaysInAdvance: number;
    inviteeTimezone: string;
    maxBookingsPerDay?: number;
  }): Promise<TeamSlotCalculatorResult> {
    // Fetch assigned team members
    const assignments = await prisma.eventTypeAssignment.findMany({
      where: {
        eventTypeId: this.eventTypeId,
        isActive: true,
        teamMember: {
          isActive: true,
        },
      },
      include: {
        teamMember: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                timezone: true,
              },
            },
          },
        },
      },
      orderBy: {
        teamMember: {
          priority: 'asc',
        },
      },
    });

    if (assignments.length === 0) {
      return {
        slots: {},
        schedulingType: this.schedulingType,
        members: [],
        lastAssignedMemberId: this.lastAssignedMemberId,
      };
    }

    const members: TeamMemberInfo[] = assignments.map((a) => ({
      id: a.teamMember.id,
      userId: a.teamMember.user.id,
      userName: a.teamMember.user.name || 'Team Member',
      userImage: a.teamMember.user.image,
      timezone: a.teamMember.user.timezone || 'UTC',
      priority: a.teamMember.priority,
      isActive: a.teamMember.isActive,
    }));

    // Calculate slots based on scheduling type
    switch (this.schedulingType) {
      case 'ROUND_ROBIN':
        return this.calculateRoundRobinSlots(members, options);
      case 'COLLECTIVE':
        return this.calculateCollectiveSlots(members, options);
      case 'MANAGED':
        return this.calculateManagedSlots(members, options);
      default:
        return this.calculateRoundRobinSlots(members, options);
    }
  }

  /**
   * Round-Robin: Rotate slot assignments among members
   */
  private async calculateRoundRobinSlots(
    members: TeamMemberInfo[],
    options: {
      duration: number;
      bufferBefore: number;
      bufferAfter: number;
      slotInterval?: number;
      minimumNotice: number;
      maxDaysInAdvance: number;
      inviteeTimezone: string;
      maxBookingsPerDay?: number;
    }
  ): Promise<TeamSlotCalculatorResult> {
    // Get availability for all members
    const memberAvailabilities = await this.getMemberAvailabilities(members, options);

    // Calculate slots for each member
    const memberSlots: Map<string, CalculatedSlots> = new Map();
    for (const memberData of memberAvailabilities) {
      const calculator = new SlotCalculator({
        duration: options.duration,
        bufferBefore: options.bufferBefore,
        bufferAfter: options.bufferAfter,
        slotInterval: options.slotInterval,
        minimumNotice: options.minimumNotice,
        maxDaysInAdvance: options.maxDaysInAdvance,
        hostTimezone: memberData.member.timezone,
        inviteeTimezone: options.inviteeTimezone,
        availability: memberData.availability,
        dateOverrides: memberData.dateOverrides,
        busyTimes: memberData.busyTimes,
        maxBookingsPerDay: options.maxBookingsPerDay,
        existingBookingsPerDay: new Map(), // Per-member limits handled separately
      });

      memberSlots.set(memberData.member.id, calculator.calculate());
    }

    // Merge and assign slots in round-robin fashion
    const result: TeamCalculatedSlots = {};
    const allDates = new Set<string>();
    memberSlots.forEach((slots) => {
      Object.keys(slots).forEach((date) => allDates.add(date));
    });

    // Find starting member index
    let memberIndex = this.lastAssignedMemberId
      ? members.findIndex((m) => m.id === this.lastAssignedMemberId)
      : -1;
    if (memberIndex === -1) memberIndex = members.length - 1;

    // Track the last assigned member for updating
    let newLastAssignedMemberId = this.lastAssignedMemberId;

    for (const date of Array.from(allDates).sort()) {
      const dateSlots: TeamSlotWithAssignment[] = [];

      // Collect all unique slot times
      const slotTimes = new Map<number, TimeSlot>();
      memberSlots.forEach((slots) => {
        const daySlots = slots[date] || [];
        daySlots.forEach((slot) => {
          slotTimes.set(slot.start.getTime(), slot);
        });
      });

      // Sort by time
      const sortedSlots = Array.from(slotTimes.values()).sort(
        (a, b) => a.start.getTime() - b.start.getTime()
      );

      // Assign each slot to next available member
      for (const slot of sortedSlots) {
        for (let i = 0; i < members.length; i++) {
          memberIndex = (memberIndex + 1) % members.length;
          const member = members[memberIndex];
          const memberDaySlots = memberSlots.get(member.id)?.[date] || [];

          const isAvailable = memberDaySlots.some(
            (s) => s.start.getTime() === slot.start.getTime()
          );

          if (isAvailable) {
            dateSlots.push({
              start: slot.start,
              end: slot.end,
              assignedMemberId: member.id,
              assignedMemberName: member.userName,
            });
            newLastAssignedMemberId = member.id;
            break;
          }
        }
      }

      if (dateSlots.length > 0) {
        result[date] = dateSlots;
      }
    }

    return {
      slots: result,
      schedulingType: 'ROUND_ROBIN',
      members,
      lastAssignedMemberId: newLastAssignedMemberId,
    };
  }

  /**
   * Collective: Only return slots where ALL members are available
   */
  private async calculateCollectiveSlots(
    members: TeamMemberInfo[],
    options: {
      duration: number;
      bufferBefore: number;
      bufferAfter: number;
      slotInterval?: number;
      minimumNotice: number;
      maxDaysInAdvance: number;
      inviteeTimezone: string;
      maxBookingsPerDay?: number;
    }
  ): Promise<TeamSlotCalculatorResult> {
    if (members.length === 0) {
      return {
        slots: {},
        schedulingType: 'COLLECTIVE',
        members: [],
      };
    }

    // Get availability for all members
    const memberAvailabilities = await this.getMemberAvailabilities(members, options);

    // Calculate slots for each member
    const memberSlotsMap: Map<string, CalculatedSlots> = new Map();
    for (const memberData of memberAvailabilities) {
      const calculator = new SlotCalculator({
        duration: options.duration,
        bufferBefore: options.bufferBefore,
        bufferAfter: options.bufferAfter,
        slotInterval: options.slotInterval,
        minimumNotice: options.minimumNotice,
        maxDaysInAdvance: options.maxDaysInAdvance,
        hostTimezone: memberData.member.timezone,
        inviteeTimezone: options.inviteeTimezone,
        availability: memberData.availability,
        dateOverrides: memberData.dateOverrides,
        busyTimes: memberData.busyTimes,
        maxBookingsPerDay: options.maxBookingsPerDay,
        existingBookingsPerDay: new Map(),
      });

      memberSlotsMap.set(memberData.member.id, calculator.calculate());
    }

    // Find intersection of all members' availability
    const result: TeamCalculatedSlots = {};
    const firstMemberSlots = memberSlotsMap.get(members[0].id);
    if (!firstMemberSlots) {
      return { slots: {}, schedulingType: 'COLLECTIVE', members };
    }

    for (const date of Object.keys(firstMemberSlots)) {
      const firstDaySlots = firstMemberSlots[date] || [];

      // Filter to only slots where ALL members are free
      const collectiveSlots = firstDaySlots.filter((slot) => {
        const slotTime = slot.start.getTime();

        return members.every((member) => {
          const memberSlots = memberSlotsMap.get(member.id)?.[date] || [];
          return memberSlots.some((s) => s.start.getTime() === slotTime);
        });
      });

      if (collectiveSlots.length > 0) {
        result[date] = collectiveSlots.map((slot) => ({
          start: slot.start,
          end: slot.end,
          // All members are assigned for collective
          availableMembers: members,
        }));
      }
    }

    return {
      slots: result,
      schedulingType: 'COLLECTIVE',
      members,
    };
  }

  /**
   * Managed: Show all available slots, host assigns member later
   */
  private async calculateManagedSlots(
    members: TeamMemberInfo[],
    options: {
      duration: number;
      bufferBefore: number;
      bufferAfter: number;
      slotInterval?: number;
      minimumNotice: number;
      maxDaysInAdvance: number;
      inviteeTimezone: string;
      maxBookingsPerDay?: number;
    }
  ): Promise<TeamSlotCalculatorResult> {
    // Get availability for all members
    const memberAvailabilities = await this.getMemberAvailabilities(members, options);

    // Calculate slots for each member
    const memberSlotsMap: Map<string, CalculatedSlots> = new Map();
    for (const memberData of memberAvailabilities) {
      const calculator = new SlotCalculator({
        duration: options.duration,
        bufferBefore: options.bufferBefore,
        bufferAfter: options.bufferAfter,
        slotInterval: options.slotInterval,
        minimumNotice: options.minimumNotice,
        maxDaysInAdvance: options.maxDaysInAdvance,
        hostTimezone: memberData.member.timezone,
        inviteeTimezone: options.inviteeTimezone,
        availability: memberData.availability,
        dateOverrides: memberData.dateOverrides,
        busyTimes: memberData.busyTimes,
        maxBookingsPerDay: options.maxBookingsPerDay,
        existingBookingsPerDay: new Map(),
      });

      memberSlotsMap.set(memberData.member.id, calculator.calculate());
    }

    // Union of all slots with their available members
    const result: TeamCalculatedSlots = {};
    const allDates = new Set<string>();
    memberSlotsMap.forEach((slots) => {
      Object.keys(slots).forEach((date) => allDates.add(date));
    });

    for (const date of Array.from(allDates).sort()) {
      // Collect all unique slot times and which members are available
      const slotAvailability = new Map<
        number,
        { slot: TimeSlot; members: TeamMemberInfo[] }
      >();

      for (const member of members) {
        const memberDaySlots = memberSlotsMap.get(member.id)?.[date] || [];
        for (const slot of memberDaySlots) {
          const key = slot.start.getTime();
          const existing = slotAvailability.get(key);
          if (existing) {
            existing.members.push(member);
          } else {
            slotAvailability.set(key, { slot, members: [member] });
          }
        }
      }

      // Convert to array and sort by time
      const daySlots: TeamSlotWithAssignment[] = Array.from(
        slotAvailability.values()
      )
        .sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime())
        .map(({ slot, members: availableMembers }) => ({
          start: slot.start,
          end: slot.end,
          availableMembers, // Host will pick from these
        }));

      if (daySlots.length > 0) {
        result[date] = daySlots;
      }
    }

    return {
      slots: result,
      schedulingType: 'MANAGED',
      members,
    };
  }

  /**
   * Fetch availability data for all members
   */
  private async getMemberAvailabilities(
    members: TeamMemberInfo[],
    options: {
      maxDaysInAdvance: number;
    }
  ): Promise<MemberAvailabilityData[]> {
    const now = new Date();
    const rangeEnd = addDays(now, options.maxDaysInAdvance);

    const results: MemberAvailabilityData[] = [];

    for (const member of members) {
      // Get member's default schedule
      const schedule = await prisma.availabilitySchedule.findFirst({
        where: {
          userId: member.userId,
          isDefault: true,
        },
        include: {
          slots: true,
          overrides: true,
        },
      });

      const availability: AvailabilityWindow[] =
        schedule?.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
        })) || [];

      const dateOverrides: DateOverride[] =
        schedule?.overrides.map((o) => ({
          date: o.date,
          isWorking: o.isWorking,
          startTime: o.startTime || undefined,
          endTime: o.endTime || undefined,
        })) || [];

      // Get member's busy times from calendars
      let busyTimes: BusyTime[] = [];

      // Fetch from Google Calendar
      try {
        const googleBusy = await getAllBusyTimes(member.userId, now, rangeEnd);
        busyTimes.push(...googleBusy);
      } catch {
        // Calendar not connected, continue
      }

      // Fetch from Outlook
      try {
        const outlookCalendar = await prisma.calendar.findFirst({
          where: {
            userId: member.userId,
            provider: 'OUTLOOK',
            isEnabled: true,
          },
        });
        if (outlookCalendar) {
          const outlookBusy = await getOutlookBusyTimes(
            outlookCalendar.id,
            now,
            rangeEnd
          );
          busyTimes.push(...outlookBusy);
        }
      } catch {
        // Outlook not connected, continue
      }

      // Get existing bookings for this member
      const memberBookings = await prisma.booking.findMany({
        where: {
          OR: [
            { hostId: member.userId },
            { assignedUserId: member.userId },
          ],
          status: { in: ['PENDING', 'CONFIRMED'] },
          endTime: { gte: now },
        },
        select: {
          startTime: true,
          endTime: true,
        },
      });

      busyTimes.push(
        ...memberBookings.map((b) => ({
          start: b.startTime,
          end: b.endTime,
        }))
      );

      // Merge overlapping busy times
      busyTimes = mergeBusyTimes(busyTimes);

      results.push({
        member,
        availability,
        dateOverrides,
        busyTimes,
      });
    }

    return results;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the next member for round-robin assignment
 */
export function getNextRoundRobinMember(
  members: TeamMemberInfo[],
  lastAssignedMemberId?: string
): TeamMemberInfo | null {
  if (members.length === 0) return null;

  if (!lastAssignedMemberId) {
    return members[0];
  }

  const lastIndex = members.findIndex((m) => m.id === lastAssignedMemberId);
  const nextIndex = (lastIndex + 1) % members.length;
  return members[nextIndex];
}

/**
 * Update the round-robin state for an event type
 */
export async function updateRoundRobinState(
  eventTypeId: string,
  lastAssignedMemberId: string
): Promise<void> {
  await prisma.eventType.update({
    where: { id: eventTypeId },
    data: { lastAssignedMemberId },
  });
}

/**
 * Assign a specific member to a booking (for MANAGED type)
 */
export async function assignMemberToBooking(
  bookingId: string,
  assignedUserId: string,
  assignedBy: string
): Promise<void> {
  // Verify the user is authorized (team admin/owner or host)
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      eventType: {
        include: {
          team: {
            include: {
              members: {
                where: {
                  userId: assignedBy,
                  role: { in: ['OWNER', 'ADMIN'] },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!booking) {
    throw new Error('Booking not found');
  }

  const isTeamAdmin =
    booking.eventType.team?.members && booking.eventType.team.members.length > 0;
  const isHost = booking.hostId === assignedBy;

  if (!isTeamAdmin && !isHost) {
    throw new Error('Unauthorized to assign members');
  }

  // Verify assigned user is a team member for this event
  if (booking.eventType.teamId) {
    const isMember = await prisma.eventTypeAssignment.findFirst({
      where: {
        eventTypeId: booking.eventTypeId,
        isActive: true,
        teamMember: {
          userId: assignedUserId,
          isActive: true,
        },
      },
    });

    if (!isMember) {
      throw new Error('Assigned user is not an active team member for this event');
    }
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { assignedUserId },
  });
}
