import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import path from 'path'
import { writeFile, unlink } from 'fs/promises'
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

    // Get current user to check for existing upload
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true },
    })

    // Delete old uploaded avatar if it exists
    if (currentUser?.image?.startsWith('/uploads/')) {
      const oldPath = path.join(process.cwd(), 'public', currentUser.image)
      try {
        await unlink(oldPath)
      } catch {
        // File may not exist, ignore
      }
    }

    // Resize to 256x256 and convert to WebP for consistent small file size
    const filename = `${session.user.id}-${Date.now()}.webp`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
    const filePath = path.join(uploadDir, filename)

    const rawBuffer = Buffer.from(await file.arrayBuffer())
    const optimized = await sharp(rawBuffer)
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()
    await writeFile(filePath, optimized)

    // Update user image in DB
    const imageUrl = `/uploads/avatars/${filename}`
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { image: imageUrl },
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
