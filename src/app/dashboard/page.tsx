'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns'
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Phone,
  User,
  ChevronRight,
  ExternalLink,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn, getInitials, formatTime, formatDuration } from '@/lib/utils'

interface Booking {
  id: string
  uid: string
  startTime: string
  endTime: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'REJECTED'
  meetingUrl?: string
  location?: string
  inviteeName: string
  inviteeEmail: string
  eventType: {
    id: string
    title: string
    length: number
    locationType: string
  }
}

const statusConfig = {
  PENDING: {
    label: 'Pending',
    icon: AlertCircle,
    className: 'bg-yellow-100 text-yellow-700',
  },
  CONFIRMED: {
    label: 'Confirmed',
    icon: CheckCircle2,
    className: 'bg-green-100 text-green-700',
  },
  CANCELLED: {
    label: 'Cancelled',
    icon: XCircle,
    className: 'bg-red-100 text-red-700',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-red-100 text-red-700',
  },
  COMPLETED: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-gray-100 text-gray-700',
  },
}

const locationIcons = {
  GOOGLE_MEET: Video,
  ZOOM: Video,
  TEAMS: Video,
  PHONE: Phone,
  IN_PERSON: MapPin,
  CUSTOM: MapPin,
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  if (isToday(date)) return 'Today'
  if (isTomorrow(date)) return 'Tomorrow'
  return format(date, 'EEEE, MMMM d')
}

export default function DashboardPage() {
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming')

  // Fetch ALL bookings for stats cards (no filter)
  const { data: allBookings } = useQuery<Booking[]>({
    queryKey: ['bookings', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/bookings')
      if (!res.ok) throw new Error('Failed to fetch bookings')
      const data = await res.json()
      return data.bookings
    },
  })

  // Fetch filtered bookings for the current tab
  const { data: bookings, isLoading } = useQuery<Booking[]>({
    queryKey: ['bookings', filter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filter === 'upcoming') {
        params.set('upcoming', 'true')
      } else if (filter === 'past') {
        params.set('past', 'true')
      } else if (filter === 'cancelled') {
        params.set('status', 'CANCELLED')
      }

      const res = await fetch(`/api/bookings?${params}`)
      if (!res.ok) throw new Error('Failed to fetch bookings')
      const data = await res.json()
      return data.bookings
    },
  })

  // Group bookings by date
  const groupedBookings = bookings?.reduce((groups, booking) => {
    const dateLabel = getDateLabel(booking.startTime)
    if (!groups[dateLabel]) {
      groups[dateLabel] = []
    }
    groups[dateLabel].push(booking)
    return groups
  }, {} as Record<string, Booking[]>)

  // Calculate stats from ALL bookings
  const upcomingCount = allBookings?.filter(
    (b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && !isPast(new Date(b.startTime))
  ).length || 0

  const completedCount = allBookings?.filter((b) => b.status === 'COMPLETED').length || 0

  const cancelledCount = allBookings?.filter((b) => b.status === 'CANCELLED').length || 0

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
          Bookings
        </h1>
        <p className="text-gray-600">
          {upcomingCount > 0
            ? `You have ${upcomingCount} upcoming booking${upcomingCount > 1 ? 's' : ''}`
            : 'No upcoming bookings'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-ocean-100 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-ocean-600" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-gray-900">
                  {upcomingCount}
                </p>
                <p className="text-sm text-gray-500">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-gray-900">
                  {completedCount}
                </p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-gray-900">
                  {cancelledCount}
                </p>
                <p className="text-sm text-gray-500">Cancelled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={filter === 'upcoming' ? 'default' : 'ghost'}
          onClick={() => setFilter('upcoming')}
        >
          Upcoming
        </Button>
        <Button
          variant={filter === 'past' ? 'default' : 'ghost'}
          onClick={() => setFilter('past')}
        >
          Past
        </Button>
        <Button
          variant={filter === 'cancelled' ? 'default' : 'ghost'}
          onClick={() => setFilter('cancelled')}
        >
          Cancelled
        </Button>
      </div>

      {/* Bookings List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
        </div>
      ) : !bookings?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No {filter} bookings
            </h3>
            <p className="text-gray-500 mb-6">
              {filter === 'upcoming'
                ? "When someone books a meeting with you, it'll appear here."
                : filter === 'cancelled'
                ? 'Your cancelled bookings will appear here.'
                : 'Your past bookings will appear here.'}
            </p>
            <Link href="/dashboard/event-types">
              <Button>Share Your Booking Link</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedBookings || {}).map(([dateLabel, dateBookings]) => (
            <div key={dateLabel}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {dateLabel}
              </h2>
              <div className="space-y-3">
                {dateBookings.map((booking) => {
                  const StatusIcon = statusConfig[booking.status].icon
                  const LocationIcon =
                    locationIcons[booking.eventType.locationType as keyof typeof locationIcons] ||
                    MapPin

                  return (
                    <Card key={booking.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {/* Time column */}
                          <div className="flex-shrink-0 w-20 text-center">
                            <p className="text-lg font-semibold text-gray-900">
                              {format(new Date(booking.startTime), 'h:mm a')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDuration(booking.eventType.length)}
                            </p>
                          </div>

                          {/* Divider */}
                          <div className="w-px h-16 bg-gray-200 flex-shrink-0" />

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-medium text-gray-900 truncate">
                                  {booking.eventType.title}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-[10px]">
                                      {getInitials(booking.inviteeName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm text-gray-600 truncate">
                                    {booking.inviteeName}
                                  </span>
                                </div>
                              </div>

                              {/* Status badge */}
                              <div
                                className={cn(
                                  'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                                  statusConfig[booking.status].className
                                )}
                              >
                                <StatusIcon className="h-3 w-3" />
                                {statusConfig[booking.status].label}
                              </div>
                            </div>

                            {/* Location/Meeting link */}
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1 text-sm text-gray-500">
                                <LocationIcon className="h-4 w-4" />
                                {booking.meetingUrl ? (
                                  <a
                                    href={booking.meetingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-ocean-600 hover:underline flex items-center gap-1"
                                  >
                                    Join Meeting
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <span>{booking.location || 'No location set'}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <Link
                            href={`/dashboard/bookings/${booking.uid}`}
                            className="flex-shrink-0"
                          >
                            <Button variant="ghost" size="icon">
                              <ChevronRight className="h-5 w-5" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
