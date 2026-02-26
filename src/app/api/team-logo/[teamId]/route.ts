import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { logoData: true, updatedAt: true },
  })

  if (!team?.logoData) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(team.logoData, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Last-Modified': team.updatedAt.toUTCString(),
    },
  })
}
