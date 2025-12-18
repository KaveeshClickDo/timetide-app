import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/users/check-username?username=xxx - Check username availability
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 })
    }

    // Validate format
    if (!/^[a-z0-9-]+$/.test(username)) {
      return NextResponse.json({ available: false, reason: 'Invalid format' })
    }

    if (username.length < 3 || username.length > 30) {
      return NextResponse.json({ available: false, reason: 'Invalid length' })
    }

    // Check reserved usernames
    const reserved = [
      'admin',
      'api',
      'auth',
      'dashboard',
      'settings',
      'login',
      'signup',
      'signin',
      'signout',
      'register',
      'account',
      'profile',
      'user',
      'users',
      'help',
      'support',
      'about',
      'contact',
      'privacy',
      'terms',
      'blog',
      'docs',
      'app',
      'timetide',
    ]

    if (reserved.includes(username)) {
      return NextResponse.json({ available: false, reason: 'Reserved' })
    }

    // Check database
    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })

    return NextResponse.json({ available: !existing })
  } catch (error) {
    console.error('Error checking username:', error)
    return NextResponse.json(
      { error: 'Failed to check username' },
      { status: 500 }
    )
  }
}
