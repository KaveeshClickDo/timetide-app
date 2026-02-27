'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatInTimeZone } from 'date-fns-tz'
import {
  ArrowLeft,
  Calendar,
  Clock,
  RefreshCw,
  AlertCircle,
  XCircle,
  CheckCircle,
  Loader2,
  User,
  Mail,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { FREQUENCY_LABELS, type RecurringFrequency } from '@/lib/recurring/utils'

interface SeriesBooking {
  id: string
  uid: string
  startTime: string
  endTime: string
  status: string
  recurringIndex: number | null
  recurringCount: number | null
  timezone: string
}

interface SeriesData {
  groupId: string
  bookings: SeriesBooking[]
  eventType: {
    title: string
    slug: string
    length: number
    locationType: string
    description: string | null
  }
  inviteeName: string
  inviteeEmail: string
  totalOccurrences: number
  recurringFrequency?: string
  recurringInterval?: number
}

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  PENDING: {
    label: 'Pending',
    icon: AlertCircle,
    className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  CONFIRMED: {
    label: 'Confirmed',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  CANCELLED: {
    label: 'Cancelled',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 border-red-200',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-red-100 text-red-700 border-red-200',
  },
  COMPLETED: {
    label: 'Completed',
    icon: Calendar,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  SKIPPED: {
    label: 'Skipped',
    icon: Clock,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
}

export default function SeriesOverviewPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const groupId = params?.groupId as string

  const { data, isLoading, error } = useQuery<SeriesData>({
    queryKey: ['recurring-series', groupId],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/series/${groupId}`)
      if (!res.ok) throw new Error('Failed to fetch series')
      return res.json()
    },
    enabled: !!groupId,
  })

  const confirmAllMutation = useMutation({
    mutationFn: async () => {
      const firstPending = data?.bookings.find(b => b.status === 'PENDING')
      if (!firstPending) throw new Error('No pending bookings')
      const res = await fetch(`/api/bookings/${firstPending.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', scope: 'all_pending' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to confirm')
      }
      return res.json()
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-series', groupId] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: `${result.updatedCount} bookings confirmed`,
        description: 'The invitee will be notified.',
      })
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <p className="text-red-600">Series not found or you don't have access.</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
      </div>
    )
  }

  const pendingCount = data.bookings.filter(b => b.status === 'PENDING').length
  const confirmedCount = data.bookings.filter(b => b.status === 'CONFIRMED').length
  const cancelledCount = data.bookings.filter(b => b.status === 'CANCELLED' || b.status === 'REJECTED').length
  const skippedCount = data.bookings.filter(b => b.status === 'SKIPPED').length
  const firstBooking = data.bookings[0]
  const lastBooking = data.bookings[data.bookings.length - 1]

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-ocean-500" />
              {data.eventType.title}
            </h1>
            <p className="text-gray-500 mt-1">
              Recurring series — {data.totalOccurrences} occurrences
              {data.recurringFrequency && (
                <span className="ml-1">
                  ({FREQUENCY_LABELS[data.recurringFrequency as RecurringFrequency] || data.recurringFrequency}{data.recurringFrequency === 'custom' && data.recurringInterval ? `, every ${data.recurringInterval} days` : ''})
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-green-600">{confirmedCount}</p>
            <p className="text-xs text-gray-500">Confirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-slate-600">{skippedCount}</p>
            <p className="text-xs text-gray-500">Skipped</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-2xl font-bold text-red-600">{cancelledCount}</p>
            <p className="text-xs text-gray-500">Cancelled</p>
          </CardContent>
        </Card>
      </div>

      {/* Invitee Info */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              {data.inviteeName}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail className="h-4 w-4" />
              {data.inviteeEmail}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              {data.eventType.length} min
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {pendingCount > 1 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <p className="text-sm text-yellow-700">
              {pendingCount} bookings awaiting confirmation
            </p>
            <Button
              size="sm"
              onClick={() => confirmAllMutation.mutate()}
              disabled={confirmAllMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {confirmAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Confirm All Pending ({pendingCount})
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Date Range */}
      {firstBooking && lastBooking && (
        <p className="text-sm text-gray-500">
          {formatInTimeZone(new Date(firstBooking.startTime), firstBooking.timezone, 'MMM d, yyyy')}
          {' — '}
          {formatInTimeZone(new Date(lastBooking.startTime), lastBooking.timezone, 'MMM d, yyyy')}
        </p>
      )}

      {/* Occurrences Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Occurrences</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {data.bookings.map((booking, idx) => {
              const status = statusConfig[booking.status] || statusConfig.CONFIRMED
              const StatusIcon = status.icon
              return (
                <Link
                  key={booking.id}
                  href={`/dashboard/bookings/${booking.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-400 w-6 text-center">
                      {(booking.recurringIndex ?? idx) + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatInTimeZone(new Date(booking.startTime), booking.timezone, 'EEEE, MMMM d, yyyy')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatInTimeZone(new Date(booking.startTime), booking.timezone, 'h:mm a')}
                        {' — '}
                        {formatInTimeZone(new Date(booking.endTime), booking.timezone, 'h:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                      status.className
                    )}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
