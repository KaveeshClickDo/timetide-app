import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Mock API for switching user plans during development/testing.
 * This endpoint should be removed or protected in production.
 */
export async function POST(request: Request) {
  // Only allow in development mode
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { plan } = body

    if (!['FREE', 'PRO', 'TEAM'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan. Must be FREE, PRO, or TEAM' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { plan },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error switching plan:', error)
    return NextResponse.json({ error: 'Failed to switch plan' }, { status: 500 })
  }
}
