'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import {
  Calendar,
  Clock,
  Video,
  MapPin,
  Phone,
  User,
  Mail,
  FileText,
  ArrowLeft,
  XCircle,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/use-toast'
import { cn, getInitials, formatDuration } from '@/lib/utils'
import { AddToCalendar } from '@/components/add-to-calendar'

interface BookingDetails {
  id: string
  uid: string
  startTime: string
  endTime: string
  timezone: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED'
  inviteeName: string
  inviteeEmail: string
  inviteePhone?: string
  inviteeNotes?: string
  location?: string
  meetingUrl?: string
  responses?: Record<string, any>
  cancellationReason?: string
  cancelledAt?: string
  createdAt: string
  eventType: {
    id: string
    title: string
    description?: string
    length: number
    locationType: string
    locationValue?: string
  }
  host: {
    id: string
    name: string
    email: string
    image?: string
    timezone: string
  }
}

const statusConfig = {
  PENDING: {
    label: 'Pending Confirmation',
    icon: AlertCircle,
    className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  CONFIRMED: {
    label: 'Confirmed',
    icon: Calendar,
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
}

const locationIcons = {
  GOOGLE_MEET: Video,
  ZOOM: Video,
  TEAMS: Video,
  PHONE: Phone,
  IN_PERSON: MapPin,
  CUSTOM: MapPin,
}

export default function BookingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // Get host's timezone from session (defaults to UTC)
  const hostTimezone = session?.user?.timezone || 'UTC'

  const { data: bookingData, isLoading, error } = useQuery({
    queryKey: ['booking', params.id],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${params.id}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to fetch booking')
      }
      const data = await res.json()
      return data.booking as BookingDetails
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bookings/${params.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to cancel booking')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', params.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: 'Booking cancelled',
        description: 'The booking has been cancelled successfully.',
      })
      setShowCancelDialog(false)
      // Redirect after a short delay
      setTimeout(() => router.push('/dashboard'), 1500)
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
        </div>
      </div>
    )
  }

  if (error || !bookingData) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Booking Not Found
            </h3>
            <p className="text-gray-500 mb-6">
              {error instanceof Error ? error.message : 'This booking could not be found.'}
            </p>
            <Link href="/dashboard">
              <Button>Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const booking = bookingData
  const StatusIcon = statusConfig[booking.status].icon
  const LocationIcon = locationIcons[booking.eventType.locationType as keyof typeof locationIcons] || MapPin
  const canCancel = booking.status === 'PENDING' || booking.status === 'CONFIRMED'

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Bookings
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
              Booking Details
            </h1>
            <p className="text-gray-600">
              Booked {format(new Date(booking.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border',
            statusConfig[booking.status].className
          )}>
            <StatusIcon className="h-4 w-4" />
            <span className="font-medium">{statusConfig[booking.status].label}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Main Event Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{booking.eventType.title}</CardTitle>
            {booking.eventType.description && (
              <p className="text-gray-600 mt-2">{booking.eventType.description}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Date & Time */}
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">
                  {formatInTimeZone(new Date(booking.startTime), hostTimezone, 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-gray-600">
                  {formatInTimeZone(new Date(booking.startTime), hostTimezone, 'h:mm a')} - {formatInTimeZone(new Date(booking.endTime), hostTimezone, 'h:mm a')}
                </p>
                <p className="text-xs text-gray-500 mt-1">Your timezone: {hostTimezone}</p>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Duration</p>
                <p className="text-gray-600">{formatDuration(booking.eventType.length)}</p>
              </div>
            </div>

            {/* Invitee Timezone */}
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Invitee Timezone</p>
                <p className="text-gray-600">{booking.timezone}</p>
              </div>
            </div>

            {/* Location */}
            {booking.location && (
              <div className="flex items-start gap-3">
                <LocationIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Location</p>
                  <p className="text-gray-600">{booking.location}</p>
                </div>
              </div>
            )}

            {/* Meeting Link */}
            {booking.meetingUrl && (
              <div className="flex items-start gap-3">
                <Video className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900 mb-1">Meeting Link</p>
                  <a
                    href={booking.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ocean-600 hover:underline flex items-center gap-1"
                  >
                    Join Meeting
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Cancellation Info */}
            {booking.status === 'CANCELLED' && booking.cancellationReason && (
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900 mb-1">Cancellation Reason</p>
                  <p className="text-red-700">{booking.cancellationReason}</p>
                  {booking.cancelledAt && (
                    <p className="text-sm text-red-600 mt-1">
                      Cancelled {formatInTimeZone(new Date(booking.cancelledAt), hostTimezone, 'MMMM d, yyyy h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invitee Information */}
        <Card>
          <CardHeader>
            <CardTitle>Invitee Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Name</p>
                <p className="text-gray-600">{booking.inviteeName}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Email</p>
                <a href={`mailto:${booking.inviteeEmail}`} className="text-ocean-600 hover:underline">
                  {booking.inviteeEmail}
                </a>
              </div>
            </div>

            {booking.inviteePhone && (
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Phone</p>
                  <a href={`tel:${booking.inviteePhone}`} className="text-ocean-600 hover:underline">
                    {booking.inviteePhone}
                  </a>
                </div>
              </div>
            )}

            {booking.inviteeNotes && (
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900 mb-1">Additional Notes</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{booking.inviteeNotes}</p>
                </div>
              </div>
            )}

            {/* Custom Responses */}
            {booking.responses && Object.keys(booking.responses).length > 0 && (
              <div className="pt-4 border-t">
                <p className="font-medium text-gray-900 mb-3">Custom Responses</p>
                <div className="space-y-3">
                  {Object.entries(booking.responses).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-sm font-medium text-gray-700">{key}</p>
                      <p className="text-gray-600">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {canCancel && (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <AddToCalendar
                bookingUid={booking.uid}
                variant="outline"
              />

              <Button
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Cancel Booking
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel your meeting with {booking.inviteeName}. They will be notified via email.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancel Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
