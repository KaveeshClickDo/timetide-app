/**
 * Team member selection logic for booking creation.
 *
 * Encapsulates round-robin, collective, and managed scheduling strategies.
 * Returns the selected host and assignment info, or throws a domain error
 * that the route handler translates to an HTTP response.
 */

import { addMinutes } from 'date-fns'
import prisma from '@/server/db/prisma'
import { CALENDAR_FETCH_BUFFER_MINUTES } from '@/server/api-constants'
import { isSlotAvailable, mergeBusyTimes } from '@/server/scheduling/slots/calculator'
import { getAllBusyTimes } from '@/server/integrations/calendar/google'

export interface HostInfo {
  id: string
  name: string | null
  email: string | null
  username: string | null
  timezone: string | null
}

interface TeamMemberAssignment {
  teamMember: {
    id: string
    user: {
      id: string
      name: string | null
      email: string | null
      username: string | null
      timezone: string | null
    }
  }
}

export interface TeamSelectionResult {
  selectedHost: HostInfo
  assignedUserId: string | undefined
  shouldUpdateRoundRobinState: boolean
}

export class TeamSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeamSelectionError'
  }
}

/**
 * Select the appropriate team member for a booking based on scheduling type.
 *
 * For ROUND_ROBIN: picks next available member in rotation order.
 * For COLLECTIVE: verifies all members are available, returns organizer/first member as host.
 * For MANAGED: returns event owner as host, no assignment (admin assigns later).
 *
 * @throws TeamSelectionError if no members are available
 */
export async function selectTeamMember(params: {
  schedulingType: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED'
  teamMemberAssignments: TeamMemberAssignment[]
  lastAssignedMemberId: string | null
  meetingOrganizerUserId: string | null
  eventOwner: HostInfo
  startDate: Date
  endDate: Date
  bufferTimeBefore: number
  bufferTimeAfter: number
}): Promise<TeamSelectionResult> {
  const {
    schedulingType,
    teamMemberAssignments,
    lastAssignedMemberId,
    meetingOrganizerUserId,
    eventOwner,
    startDate,
    endDate,
    bufferTimeBefore,
    bufferTimeAfter,
  } = params

  const assignedMembers = teamMemberAssignments.map(a => a.teamMember)

  if (schedulingType === 'ROUND_ROBIN') {
    return selectRoundRobinMember({
      assignedMembers,
      lastAssignedMemberId,
      startDate,
      endDate,
      bufferTimeBefore,
      bufferTimeAfter,
    })
  }

  if (schedulingType === 'COLLECTIVE') {
    return selectCollectiveHost({
      assignedMembers,
      meetingOrganizerUserId,
      startDate,
      endDate,
      bufferTimeBefore,
      bufferTimeAfter,
    })
  }

  // MANAGED: event owner is the initial host, no assignment
  return {
    selectedHost: eventOwner,
    assignedUserId: undefined,
    shouldUpdateRoundRobinState: false,
  }
}

// ─── Round-robin: pick next available member in rotation ──────────────────────

async function selectRoundRobinMember(params: {
  assignedMembers: TeamMemberAssignment['teamMember'][]
  lastAssignedMemberId: string | null
  startDate: Date
  endDate: Date
  bufferTimeBefore: number
  bufferTimeAfter: number
}): Promise<TeamSelectionResult> {
  const { assignedMembers, lastAssignedMemberId, startDate, endDate, bufferTimeBefore, bufferTimeAfter } = params

  const lastAssignedIndex = lastAssignedMemberId
    ? assignedMembers.findIndex(m => m.id === lastAssignedMemberId)
    : -1

  let memberIndex = lastAssignedIndex

  for (let i = 0; i < assignedMembers.length; i++) {
    memberIndex = (memberIndex + 1) % assignedMembers.length
    const member = assignedMembers[memberIndex]

    const available = await isMemberAvailable(
      member.user.id, startDate, endDate, bufferTimeBefore, bufferTimeAfter
    )

    if (available) {
      return {
        selectedHost: {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          username: member.user.username,
          timezone: member.user.timezone,
        },
        assignedUserId: member.user.id,
        shouldUpdateRoundRobinState: true,
      }
    }
  }

  throw new TeamSelectionError('No team members are available at this time.')
}

// ─── Collective: all members must be available ────────────────────────────────

async function selectCollectiveHost(params: {
  assignedMembers: TeamMemberAssignment['teamMember'][]
  meetingOrganizerUserId: string | null
  startDate: Date
  endDate: Date
  bufferTimeBefore: number
  bufferTimeAfter: number
}): Promise<TeamSelectionResult> {
  const { assignedMembers, meetingOrganizerUserId, startDate, endDate, bufferTimeBefore, bufferTimeAfter } = params

  for (const member of assignedMembers) {
    const available = await isMemberAvailable(
      member.user.id, startDate, endDate, bufferTimeBefore, bufferTimeAfter
    )
    if (!available) {
      throw new TeamSelectionError('This time slot is no longer available for all team members.')
    }
  }

  // Use the meeting organizer as host if set, otherwise first assigned member
  const organizerMember = meetingOrganizerUserId
    ? assignedMembers.find(m => m.user.id === meetingOrganizerUserId)
    : null
  const hostMember = organizerMember || assignedMembers[0]

  return {
    selectedHost: {
      id: hostMember.user.id,
      name: hostMember.user.name,
      email: hostMember.user.email,
      username: hostMember.user.username,
      timezone: hostMember.user.timezone,
    },
    assignedUserId: undefined,
    shouldUpdateRoundRobinState: false,
  }
}

// ─── Shared: check if a single member is available at the given slot ──────────

async function isMemberAvailable(
  userId: string,
  startDate: Date,
  endDate: Date,
  bufferTimeBefore: number,
  bufferTimeAfter: number
): Promise<boolean> {
  let memberBusyTimes: { start: Date; end: Date }[] = []
  try {
    memberBusyTimes = await getAllBusyTimes(
      userId,
      addMinutes(startDate, -CALENDAR_FETCH_BUFFER_MINUTES),
      addMinutes(endDate, CALENDAR_FETCH_BUFFER_MINUTES)
    )
  } catch {
    // Calendar not connected, continue
  }

  const memberBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { hostId: userId },
        { assignedUserId: userId },
        { attendees: { some: { userId } } },
      ],
      status: { in: ['PENDING', 'CONFIRMED'] },
      startTime: { lt: endDate },
      endTime: { gt: startDate },
    },
  })

  const memberBusyFromBookings = memberBookings.map(b => ({
    start: b.startTime,
    end: b.endTime,
  }))

  const allMemberBusy = mergeBusyTimes([...memberBusyTimes, ...memberBusyFromBookings])
  return isSlotAvailable(
    { start: startDate, end: endDate },
    allMemberBusy,
    bufferTimeBefore,
    bufferTimeAfter
  )
}
