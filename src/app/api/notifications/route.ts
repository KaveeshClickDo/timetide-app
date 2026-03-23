import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/admin-auth';
import prisma from '@/server/db/prisma';
import { DEFAULT_PAGE_SIZE, MAX_LIST_LIMIT } from '@/server/api-constants';

// GET /api/notifications - List user's notifications (paginated)
export async function GET(request: NextRequest) {
  try {
    const { error, session } = await requireAuth();
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const cursor = searchParams.get('cursor');
    const limit = Math.min(MAX_LIST_LIMIT, Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE))));

    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const unreadCount = await prisma.notification.count({
      where: { userId: session.user.id, read: false },
    });

    return NextResponse.json({
      notifications: items,
      unreadCount,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}
