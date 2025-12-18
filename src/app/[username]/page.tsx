import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Clock, Video, MapPin, Phone, Globe, ChevronRight, Waves } from 'lucide-react'
import { getInitials, formatDuration } from '@/lib/utils'

interface PageProps {
  params: { username: string }
}

export async function generateMetadata({ params }: PageProps) {
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: { name: true },
  })

  if (!user) {
    return { title: 'Not Found' }
  }

  return {
    title: `Book a meeting with ${user.name}`,
    description: `Schedule time with ${user.name} on TimeTide`,
  }
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

export default async function UserProfilePage({ params }: PageProps) {
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      bio: true,
    },
  })

  if (!user) {
    notFound()
  }

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
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-tide-50">
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
        {eventTypes.length === 0 ? (
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
            <Waves className="h-4 w-4" />
            Powered by TimeTide
          </Link>
        </div>
      </div>
    </div>
  )
}
