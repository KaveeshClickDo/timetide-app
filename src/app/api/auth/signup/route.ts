import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { signUpSchema } from '@/lib/validation/schemas'
import { nanoid } from 'nanoid'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Validate input
    const result = signUpSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { name, email, password } = result.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Generate unique username from email
    const emailPrefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    let username = emailPrefix
    let counter = 1

    while (await prisma.user.findUnique({ where: { username } })) {
      username = `${emailPrefix}${counter}`
      counter++
    }

    // Create user with default availability
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        username,
        timezone: 'America/New_York', // Default, can be updated later
        // Create default availability schedule
        availabilitySchedules: {
          create: {
            name: 'Working Hours',
            isDefault: true,
            slots: {
              create: [
                // Monday - Friday, 9 AM - 5 PM
                { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
                { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
                { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
                { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
                { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
              ],
            },
          },
        },
        // Create default 30-minute meeting event type
        eventTypes: {
          create: {
            title: '30 Minute Meeting',
            slug: `30min-${nanoid(6)}`,
            description: 'A quick 30-minute meeting',
            duration: 30,
            locationType: 'GOOGLE_MEET',
            isActive: true,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
      },
    })
  } catch (error) {
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    )
  }
}
