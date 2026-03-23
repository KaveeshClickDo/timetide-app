import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/server/auth/admin-auth'
import { adminUpdateUserSchema } from '@/server/validation/schemas'
import { checkAdminRateLimit } from '@/server/infrastructure/queue'
import {
  getAdminUserDetail,
  updateAdminUser,
  deleteAdminUser,
  AdminUserNotFoundError,
  AdminCannotDeleteAdminError,
  AdminInvalidTransitionError,
  AdminSubscriptionError,
  AdminInvalidPlanError,
} from '@/server/services/admin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    const user = await getAdminUserDetail(id)
    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof AdminUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('Admin user detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  const rateLimit = await checkAdminRateLimit(session!.user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString() } },
    )
  }

  try {
    const { id } = await params
    const body = await req.json()
    const parsed = adminUpdateUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const user = await updateAdminUser({
      userId: id,
      adminId: session!.user.id,
      data: parsed.data,
    })
    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof AdminUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof AdminInvalidTransitionError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        currentStatus: error.currentStatus,
        currentPlan: error.currentPlan,
      }, { status: 400 })
    }
    if (error instanceof AdminSubscriptionError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        currentStatus: error.currentStatus,
        currentPlan: error.currentPlan,
      }, { status: 400 })
    }
    if (error instanceof AdminInvalidPlanError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Admin user update error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAdmin()
  if (error) return error

  try {
    const { id } = await params
    await deleteAdminUser(id, session!.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AdminUserNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    if (error instanceof AdminCannotDeleteAdminError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Admin user delete error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
