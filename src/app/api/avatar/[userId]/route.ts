import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarData: true, updatedAt: true },
  })

  if (!user?.avatarData) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(user.avatarData, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Last-Modified': user.updatedAt.toUTCString(),
    },
  })
}
