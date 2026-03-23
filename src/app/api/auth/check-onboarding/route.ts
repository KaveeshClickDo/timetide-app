import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/auth'
import { checkOnboarding } from '@/server/services/auth'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ needsOnboarding: false })
    }

    const needsOnboarding = await checkOnboarding(session.user.id)
    return NextResponse.json({ needsOnboarding })
  } catch {
    return NextResponse.json({ needsOnboarding: false })
  }
}
