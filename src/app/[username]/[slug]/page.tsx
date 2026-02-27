'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import BookingWidget from '@/components/booking/booking-widget'
import Link from 'next/link'

interface User {
  id: string
  name: string | null
  username: string
  image: string | null
  timezone: string
}

interface Question {
  id: string
  type: string
  label: string
  required: boolean
  placeholder: string | null
  options: string[] | null
}

interface EventType {
  id: string
  title: string
  description: string | null
  length: number
  locationType: string
  seatsPerSlot?: number
  allowsRecurring?: boolean
  recurringMaxWeeks?: number
  recurringFrequency?: string
  recurringInterval?: number
  questions?: Question[]
}

export default function BookingPage() {
  const params = useParams()
  const username = params?.username as string
  const slug = params?.slug as string

  // Fetch event type and user data
  const { data, isLoading, error } = useQuery<{ user: User; eventType: EventType }>({
    queryKey: ['public-event-type', username, slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/event-types?username=${username}&slug=${slug}`)
      if (!res.ok) {
        throw new Error('Event type not found')
      }
      return res.json()
    },
    enabled: !!username && !!slug,
  })

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ocean-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading event details...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Event Not Found</h1>
          <p className="text-gray-500 mb-4">The event you're looking for doesn't exist or is no longer available.</p>
          <Link href={`/${username}`} className="text-ocean-600 hover:text-ocean-700">
            Back to profile
          </Link>
        </div>
      </div>
    )
  }

  const { user, eventType } = data

  const eventJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: eventType.title,
    ...(eventType.description && { description: eventType.description }),
    url: `https://timetide.app/${user.username}/${slug}`,
    provider: {
      '@type': 'Person',
      name: user.name || 'User',
      url: `https://timetide.app/${user.username}`,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'GBP',
      availability: 'https://schema.org/InStock',
    },
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
      />
      <BookingWidget
        user={{
          name: user.name || 'User',
          username: user.username,
          image: user.image,
          timezone: user.timezone || 'UTC',
        }}
        eventType={{
          id: eventType.id,
          title: eventType.title,
          description: eventType.description,
          length: eventType.length,
          locationType: eventType.locationType,
          seatsPerSlot: eventType.seatsPerSlot,
          allowsRecurring: eventType.allowsRecurring,
          recurringMaxWeeks: eventType.recurringMaxWeeks,
          recurringFrequency: eventType.recurringFrequency ?? undefined,
          recurringInterval: eventType.recurringInterval ?? undefined,
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
