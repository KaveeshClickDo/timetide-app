'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import {
  Calendar,
  Video,
  MapPin,
  Phone,
  User,
  Mail,
  FileText,
  XCircle,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
    name: string
    image?: string
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
    icon: CheckCircle2,
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
    icon: CheckCircle2,
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

export default function PublicBookingManagementPage() {
  const params = useParams()
  const queryClient = useQueryClient()
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancelled, setCancelled] = useState(false)

  const { data: bookingData, isLoading, error } = useQuery({
    queryKey: ['public-booking', params.id],
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
    mutationFn: async (reason: string) => {
      const res = await fetch(`/api/bookings/${params.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to cancel booking')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-booking', params.id] })
      setCancelled(true)
      setShowCancelDialog(false)
    },
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    )
  }

  if (error || !bookingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Booking Not Found
            </h3>
            <p className="text-gray-500">
              {error instanceof Error ? error.message : 'This booking could not be found or the link has expired.'}
            </p>
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
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ocean-100 mb-4">
            <Calendar className="h-8 w-8 text-ocean-600" />
          </div>
          <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
            {cancelled ? 'Booking Cancelled' : 'Booking Confirmation'}
          </h1>
          <div className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-full border mt-2',
            statusConfig[cancelled ? 'CANCELLED' : booking.status].className
          )}>
            <StatusIcon className="h-4 w-4" />
            <span className="font-medium">
              {statusConfig[cancelled ? 'CANCELLED' : booking.status].label}
            </span>
          </div>
        </div>

        {cancelled ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                Your booking has been cancelled
              </h3>
              <p className="text-gray-600 mb-6">
                A cancellation confirmation has been sent to {booking.inviteeEmail}
              </p>
              <p className="text-sm text-gray-500">
                You can close this page now.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Event Details Card */}
            <Card className="mb-6">
              <CardHeader className="text-center border-b">
                <div className="flex items-center justify-center gap-3 mb-2">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={booking.host.image} />
                    <AvatarFallback>{getInitials(booking.host.name)}</AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="text-sm text-gray-600">Meeting with</p>
                    <p className="font-semibold text-gray-900">{booking.host.name}</p>
                  </div>
                </div>
                <CardTitle className="text-2xl mt-4">{booking.eventType.title}</CardTitle>
                {booking.eventType.description && (
                  <p className="text-gray-600 mt-2">{booking.eventType.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                {/* Date & Time */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-5 w-5 text-ocean-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatInTimeZone(new Date(booking.startTime), booking.timezone, 'EEEE, MMMM d, yyyy')}
                    </p>
                    <p className="text-gray-600">
                      {formatInTimeZone(new Date(booking.startTime), booking.timezone, 'h:mm a')} - {formatInTimeZone(new Date(booking.endTime), booking.timezone, 'h:mm a')}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {booking.timezone} • {formatDuration(booking.eventType.length)}
                    </p>
                  </div>
                </div>

                {/* Location */}
                {booking.location && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center flex-shrink-0">
                      <LocationIcon className="h-5 w-5 text-ocean-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Location</p>
                      <p className="text-gray-600">{booking.location}</p>
                    </div>
                  </div>
                )}

                {/* Meeting Link */}
                {booking.meetingUrl && (
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center flex-shrink-0">
                      <Video className="h-5 w-5 text-ocean-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 mb-2">Video Conference</p>
                      <a
                        href={booking.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-ocean-600 hover:underline"
                      >
                        Join Meeting
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Invitee Info */}
                <div className="pt-4 border-t">
                  <p className="font-medium text-gray-900 mb-3">Your Information</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-gray-600">
                      <User className="h-4 w-4" />
                      <span>{booking.inviteeName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="h-4 w-4" />
                      <span>{booking.inviteeEmail}</span>
                    </div>
                    {booking.inviteePhone && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="h-4 w-4" />
                        <span>{booking.inviteePhone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {booking.inviteeNotes && (
                  <div className="pt-4 border-t">
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-gray-400 mt-1" />
                      <div>
                        <p className="font-medium text-gray-900 mb-1">Additional Notes</p>
                        <p className="text-gray-600 whitespace-pre-wrap">{booking.inviteeNotes}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            {canCancel && (
              <Card>
                <CardContent className="py-6">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <AddToCalendar
                      bookingUid={booking.uid}
                      variant="outline"
                      className="flex-1"
                    />

                    <Button
                      variant="destructive"
                      className="flex-1"
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
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cancellation Notice */}
            {booking.status === 'CANCELLED' && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-6">
                  <div className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-900">This booking has been cancelled</p>
                      {booking.cancellationReason && (
                        <p className="text-red-700 mt-1">{booking.cancellationReason}</p>
                      )}
                      {booking.cancelledAt && (
                        <p className="text-sm text-red-600 mt-2">
                          Cancelled on {formatInTimeZone(new Date(booking.cancelledAt), booking.timezone, 'MMMM d, yyyy h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>TimeTide Powered by SeekaHost Technologies Ltd.</p>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your meeting with {booking.host.name}?
              They will be notified via email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="reason" className="text-sm text-gray-700">
              Reason for cancellation (optional)
            </Label>
            <Textarea
              id="reason"
              placeholder="Let them know why you're cancelling..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              Keep Booking
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate(cancellationReason)}
              disabled={cancelMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Booking'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
