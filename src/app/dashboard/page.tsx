'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
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
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn, getInitials, formatTime, formatDuration } from '@/lib/utils'
import { UpgradeBanner } from '@/components/upgrade-banner'

interface Booking {
  id: string
  uid: string
  startTime: string
  endTime: string
  timezone: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'REJECTED' | 'SKIPPED'
  meetingUrl?: string
  location?: string
  inviteeName: string
  inviteeEmail: string
  recurringGroupId?: string | null
  recurringIndex?: number | null
  recurringCount?: number | null
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
  SKIPPED: {
    label: 'Skipped',
    icon: Clock,
    className: 'bg-slate-100 text-slate-600',
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
  const { data: session } = useSession()
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'cancelled' | 'declined'>('upcoming')

  // Get host's timezone from session (defaults to UTC)
  const hostTimezone = session?.user?.timezone || 'UTC'

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
      } else if (filter === 'declined') {
        params.set('status', 'REJECTED')
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
    (b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && !isPast(new Date(b.endTime))
  ).length || 0

  // Completed = explicitly COMPLETED OR confirmed/pending bookings whose end time has passed
  const completedCount = allBookings?.filter(
    (b) => b.status === 'COMPLETED' ||
      ((b.status === 'PENDING' || b.status === 'CONFIRMED') && isPast(new Date(b.endTime)))
  ).length || 0

  const cancelledCount = allBookings?.filter((b) => b.status === 'CANCELLED').length || 0
  const declinedCount = allBookings?.filter((b) => b.status === 'REJECTED').length || 0

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-2">
          Bookings
        </h1>
        <p className="text-gray-600">
          {upcomingCount > 0
            ? `You have ${upcomingCount} upcoming booking${upcomingCount > 1 ? 's' : ''}`
            : 'No upcoming bookings'}
        </p>
      </div>

      {/* Upgrade Banner */}
      <UpgradeBanner />

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-ocean-100 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-4 w-4 sm:h-6 sm:w-6 text-ocean-600" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">{upcomingCount}</p>
                <p className="text-xs sm:text-sm text-gray-500">Upcoming</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">{completedCount}</p>
                <p className="text-xs sm:text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <XCircle className="h-4 w-4 sm:h-6 sm:w-6 text-red-600" />
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-heading font-bold text-gray-900">{cancelledCount}</p>
                <p className="text-xs sm:text-sm text-gray-500">Cancelled</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter tabs */}
      <div className="mb-6">
        {/* Mobile pill filter */}
        <div className="sm:hidden flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {(['upcoming', 'past', 'cancelled', 'declined'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors capitalize',
                filter === f
                  ? 'bg-ocean-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Desktop tabs */}
        <div className="hidden sm:flex gap-2">
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
          <Button
            variant={filter === 'declined' ? 'default' : 'ghost'}
            onClick={() => setFilter('declined')}
          >
            Declined
          </Button>
        </div>
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
                  : filter === 'declined'
                    ? 'Bookings you have declined will appear here.'
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
                        <div className="flex items-start gap-3 sm:gap-4">
                          {/* Time column */}
                          <div className="flex-shrink-0 w-14 sm:w-20 text-center">
                            <p className="text-sm sm:text-lg font-semibold text-gray-900">
                              {formatInTimeZone(new Date(booking.startTime), hostTimezone, 'h:mm a')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDuration(booking.eventType.length)}
                            </p>
                          </div>

                          {/* Divider */}
                          <div className="w-px h-16 bg-gray-200 flex-shrink-0" />

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              {/* Title + invitee */}
                              <div className="min-w-0 flex-1">
                                <h3 className="font-medium text-gray-900 truncate text-sm sm:text-base">
                                  {booking.eventType.title}
                                  {booking.recurringGroupId && booking.recurringCount && (
                                    <Link
                                      href={`/dashboard/bookings/series/${booking.recurringGroupId}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-ocean-100 text-ocean-700 hover:bg-ocean-200 transition-colors"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                      {(booking.recurringIndex ?? 0) + 1}/{booking.recurringCount}
                                    </Link>
                                  )}
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

                              {/* Status badge + chevron grouped together so nothing overflows */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <div
                                  className={cn(
                                    'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                                    statusConfig[booking.status].className
                                  )}
                                >
                                  <StatusIcon className="h-3 w-3" />
                                  <span className="hidden sm:inline">{statusConfig[booking.status].label}</span>
                                </div>
                                <Link href={`/dashboard/bookings/${booking.uid}`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                                    <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                                  </Button>
                                </Link>
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
