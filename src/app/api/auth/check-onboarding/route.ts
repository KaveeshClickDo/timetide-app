import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ needsOnboarding: false });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompleted: true },
    });

    return NextResponse.json({
      needsOnboarding: !user?.onboardingCompleted,
    });
  } catch {
    return NextResponse.json({ needsOnboarding: false });
  }
}
