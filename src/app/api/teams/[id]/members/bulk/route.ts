import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { bulkMemberActionSchema } from '@/lib/validation/schemas'
import { logTeamAction } from '@/lib/team-audit'

interface RouteParams {
  params: { id: string }
}

// POST /api/teams/[id]/members/bulk - Bulk member actions
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin/owner access
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: params.id,
          userId: session.user.id,
        },
      },
    })

    if (!membership || membership.role === 'MEMBER') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const body = await request.json()
    const result = bulkMemberActionSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { action, memberIds, role } = result.data

    // Fetch all target members
    const targetMembers = await prisma.teamMember.findMany({
      where: {
        id: { in: memberIds },
        teamId: params.id,
      },
    })

    if (targetMembers.length === 0) {
      return NextResponse.json({ error: 'No valid members found' }, { status: 400 })
    }

    // Safety: cannot modify owners unless current user is owner
    const hasOwnerTargets = targetMembers.some((m) => m.role === 'OWNER')
    if (hasOwnerTargets && membership.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only owners can modify other owners' },
        { status: 403 }
      )
    }

    // Safety: cannot remove all owners
    if (action === 'remove' || (action === 'change_role' && role !== 'OWNER')) {
      const ownerTargetIds = targetMembers
        .filter((m) => m.role === 'OWNER')
        .map((m) => m.id)

      if (ownerTargetIds.length > 0) {
        const totalOwners = await prisma.teamMember.count({
          where: { teamId: params.id, role: 'OWNER' },
        })
        const remainingOwners = totalOwners - ownerTargetIds.length
        if (remainingOwners < 1) {
          return NextResponse.json(
            { error: 'Cannot remove or demote all owners. At least one owner must remain.' },
            { status: 400 }
          )
        }
      }
    }

    const validIds = targetMembers.map((m) => m.id)
    let affected = 0

    switch (action) {
      case 'change_role': {
        // Don't allow promoting to OWNER via bulk (only owners can, and it's sensitive)
        if (role === 'OWNER' && membership.role !== 'OWNER') {
          return NextResponse.json(
            { error: 'Only owners can promote to owner role' },
            { status: 403 }
          )
        }
        const result = await prisma.teamMember.updateMany({
          where: { id: { in: validIds } },
          data: { role: role! },
        })
        affected = result.count

        logTeamAction({
          teamId: params.id,
          userId: session.user.id,
          action: 'bulk.role_changed',
          changes: { memberIds: validIds, newRole: role, count: affected },
        }).catch(() => {})
        break
      }

      case 'remove': {
        const result = await prisma.teamMember.deleteMany({
          where: { id: { in: validIds } },
        })
        affected = result.count

        logTeamAction({
          teamId: params.id,
          userId: session.user.id,
          action: 'bulk.removed',
          changes: { memberIds: validIds, count: affected },
        }).catch(() => {})
        break
      }

      case 'activate': {
        const result = await prisma.teamMember.updateMany({
          where: { id: { in: validIds } },
          data: { isActive: true },
        })
        affected = result.count

        logTeamAction({
          teamId: params.id,
          userId: session.user.id,
          action: 'bulk.activated',
          changes: { memberIds: validIds, count: affected },
        }).catch(() => {})
        break
      }

      case 'deactivate': {
        const result = await prisma.teamMember.updateMany({
          where: { id: { in: validIds } },
          data: { isActive: false },
        })
        affected = result.count

        logTeamAction({
          teamId: params.id,
          userId: session.user.id,
          action: 'bulk.deactivated',
          changes: { memberIds: validIds, count: affected },
        }).catch(() => {})
        break
      }
    }

    return NextResponse.json({ success: true, affected })
  } catch (error) {
    console.error('Error performing bulk action:', error)
    return NextResponse.json(
      { error: 'Failed to perform bulk action' },
      { status: 500 }
    )
  }
}
