import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import sharp from 'sharp'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 2MB' },
        { status: 400 }
      )
    }

    // Resize to 256x256 and convert to WebP for consistent small file size
    const rawBuffer = Buffer.from(await file.arrayBuffer())
    const optimized = await sharp(rawBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()

    // Store image binary in DB and set image URL to the serving endpoint
    // Append timestamp for cache-busting when avatar is re-uploaded
    const imageUrl = `/api/avatar/${session.user.id}?v=${Date.now()}`
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        image: imageUrl,
        avatarData: optimized,
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        timezone: true,
        timezoneAutoDetect: true,
        bio: true,
        onboardingCompleted: true,
        plan: true,
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Avatar upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload avatar' },
      { status: 500 }
    )
  }
}
