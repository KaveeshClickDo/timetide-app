/**
 * /api/public/event-types
 * GET: Fetch public event type details for booking page
 * Query params: username, slug
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');
    const slug = searchParams.get('slug');

    if (!username || !slug) {
      return NextResponse.json(
        { error: 'Username and slug are required' },
        { status: 400 }
      );
    }

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        timezone: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch event type with relations
    const eventType = await prisma.eventType.findFirst({
      where: {
        slug,
        userId: user.id,
        isActive: true,
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
        schedule: {
          include: {
            slots: true,
            overrides: true,
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { error: 'Event type not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user,
      eventType,
    });
  } catch (error) {
    console.error('GET public event type error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
