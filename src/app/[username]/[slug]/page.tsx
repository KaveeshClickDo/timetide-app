import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import BookingWidget from '@/components/booking/booking-widget'

interface PageProps {
  params: {
    username: string
    slug: string
  }
}

export async function generateMetadata({ params }: PageProps) {
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: { name: true },
  })

  const eventType = await prisma.eventType.findFirst({
    where: {
      slug: params.slug,
      user: { username: params.username },
      isActive: true,
    },
    select: { title: true, description: true },
  })

  if (!user || !eventType) {
    return { title: 'Not Found' }
  }

  return {
    title: `${eventType.title} | ${user.name}`,
    description: eventType.description || `Book a ${eventType.title} with ${user.name}`,
  }
}

export default async function BookingPage({ params }: PageProps) {
  // Fetch user
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      timezone: true,
    },
  })

  if (!user) {
    notFound()
  }

  // Fetch event type
  const eventType = await prisma.eventType.findFirst({
    where: {
      slug: params.slug,
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
  })

  if (!eventType) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50">
      <BookingWidget
        user={{
          name: user.name || 'User',
          username: user.username!,
          image: user.image,
          timezone: user.timezone || 'UTC',
        }}
        eventType={{
          id: eventType.id,
          title: eventType.title,
          description: eventType.description,
          length: eventType.length,
          locationType: eventType.locationType,
          questions: eventType.questions?.map((q) => ({
            id: q.id,
            type: q.type as unknown as string,
            label: q.label,
            required: q.required,
            placeholder: q.placeholder ?? undefined,
            options: (q.options as string[] | null) ?? undefined,
          })) ?? [],
        }}
      />
    </div>
  )
}
