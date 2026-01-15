/**
 * /api/users/[username]/event-types
 * GET: Fetch public event types for a user by username
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // First, fetch the user to get their ID
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Fetch public event types for this user
    const eventTypes = await prisma.eventType.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        length: true,
        locationType: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json({ eventTypes });
  } catch (error) {
    console.error('GET user event types error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
