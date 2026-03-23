import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/server/db/prisma'
import { requireAdmin } from '@/server/auth/admin-auth'
import { logAdminAction } from '@/server/admin/admin-audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, isDisabled: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (targetUser.isDisabled) {
      return NextResponse.json({ error: 'Cannot impersonate a disabled user' }, { status: 400 })
    }

    if (targetUser.id === session!.user.id) {
      return NextResponse.json({ error: 'Cannot impersonate yourself' }, { status: 400 })
    }

    await logAdminAction({
      adminId: session!.user.id,
      action: 'IMPERSONATE_USER',
      targetType: 'User',
      targetId: id,
      details: { userEmail: targetUser.email, userName: targetUser.name },
    })

    return NextResponse.json({
      userId: targetUser.id,
      userName: targetUser.name,
      userEmail: targetUser.email,
    })
  } catch (error) {
    console.error('Impersonate error:', error)
    return NextResponse.json({ error: 'Failed to start impersonation' }, { status: 500 })
  }
}
