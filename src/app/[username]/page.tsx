'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Clock, Video, MapPin, Phone, Globe, ChevronRight } from 'lucide-react'
import { getInitials, formatDuration } from '@/lib/utils'

interface User {
  id: string
  name: string | null
  username: string
  image: string | null
  bio: string | null
}

interface EventType {
  id: string
  title: string
  slug: string
  description: string | null
  length: number
  locationType: string
}

const locationIcons: Record<string, typeof Video> = {
  GOOGLE_MEET: Video,
  ZOOM: Video,
  TEAMS: Video,
  PHONE: Phone,
  IN_PERSON: MapPin,
  CUSTOM: Globe,
}

const locationLabels: Record<string, string> = {
  GOOGLE_MEET: 'Google Meet',
  ZOOM: 'Zoom',
  TEAMS: 'Microsoft Teams',
  PHONE: 'Phone Call',
  IN_PERSON: 'In Person',
  CUSTOM: 'Custom Location',
}

export default function UserProfilePage() {
  const params = useParams()
  const username = params?.username as string

  // Fetch user data
  const { data: userData, isLoading: userLoading, error: userError } = useQuery<{ user: User }>({
    queryKey: ['user', username],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}`)
      if (!res.ok) {
        throw new Error('User not found')
      }
      return res.json()
    },
    enabled: !!username,
  })

  // Fetch event types
  const { data: eventTypesData, isLoading: eventsLoading } = useQuery<{ eventTypes: EventType[] }>({
    queryKey: ['user-event-types', username],
    queryFn: async () => {
      const res = await fetch(`/api/users/${username}/event-types`)
      if (!res.ok) {
        throw new Error('Failed to fetch event types')
      }
      return res.json()
    },
    enabled: !!username && !!userData?.user,
  })

  // Loading state
  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ocean-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading profile...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (userError || !userData?.user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">User Not Found</h1>
          <p className="text-gray-500 mb-4">The user you're looking for doesn't exist.</p>
          <Link href="/" className="text-ocean-600 hover:text-ocean-700">
            Go to homepage
          </Link>
        </div>
      </div>
    )
  }

  const user = userData.user
  const eventTypes = eventTypesData?.eventTypes || []

  const profileJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: user.name,
      url: `https://timetide.app/${user.username}`,
      ...(user.image && { image: user.image }),
      ...(user.bio && { description: user.bio }),
    },
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
      />
      <div className="max-w-2xl mx-auto py-12 px-4">
        {/* User header */}
        <div className="text-center mb-10">
          <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-white shadow-lg">
            <AvatarImage src={user.image || undefined} />
            <AvatarFallback className="text-2xl bg-ocean-100 text-ocean-700">
              {user.name ? getInitials(user.name) : 'U'}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-heading font-bold text-gray-900 mb-1">
            {user.name}
          </h1>
          <p className="text-gray-500">@{user.username}</p>
          {user.bio && (
            <p className="text-gray-600 mt-3 max-w-md mx-auto">{user.bio}</p>
          )}
        </div>

        {/* Event types list */}
        {eventsLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ocean-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading event types...</p>
          </div>
        ) : eventTypes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No event types available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {eventTypes.map((eventType) => {
              const LocationIcon = locationIcons[eventType.locationType] || Globe

              return (
                <Link
                  key={eventType.id}
                  href={`/${user.username}/${eventType.slug}`}
                >
                  <Card className="hover:shadow-lg hover:border-ocean-200 transition-all cursor-pointer group">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-4">
                        {/* Color bar */}
                        <div className="w-1.5 h-16 rounded-full bg-ocean-500 flex-shrink-0 group-hover:bg-ocean-600 transition-colors" />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg font-semibold text-gray-900 group-hover:text-ocean-700 transition-colors">
                            {eventType.title}
                          </h2>
                          {eventType.description && (
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                              {eventType.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {formatDuration(eventType.length)}
                            </div>
                            <div className="flex items-center gap-1">
                              <LocationIcon className="h-4 w-4" />
                              {locationLabels[eventType.locationType] || eventType.locationType}
                            </div>
                          </div>
                        </div>

                        {/* Arrow */}
                        <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-ocean-500 transition-colors flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Image
              src="/logo.svg"
              alt="TimeTide"
              width={20}
              height={20}
            />
            TimeTide Powered by SeekaHost Technologies Ltd.
          </Link>
        </div>
      </div>
    </div>
  )
}
