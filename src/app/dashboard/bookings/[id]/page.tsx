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
  CheckCircle,
  ChevronRight,
  X,
  Users,
  UserPlus,
  RefreshCw,
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn, getInitials, formatDuration } from '@/lib/utils'
import { AddToCalendar } from '@/components/add-to-calendar'

interface TeamMember {
  id: string
  userId: string
  name: string | null
  email: string
  image: string | null
  timezone: string
  priority: number
}

interface BookingDetails {
  id: string
  uid: string
  startTime: string
  endTime: string
  timezone: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED' | 'SKIPPED'
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
  recurringGroupId?: string
  recurringIndex?: number
  recurringCount?: number
  recurringBookings?: Array<{
    id: string
    uid: string
    startTime: string
    endTime: string
    status: string
    recurringIndex: number | null
  }>
  assignedUserId?: string
  assignedUser?: {
    id: string
    name: string | null
    email: string
    image: string | null
  }
  eventType: {
    id: string
    title: string
    description?: string
    length: number
    locationType: string
    locationValue?: string
    schedulingType?: 'ROUND_ROBIN' | 'COLLECTIVE' | 'MANAGED'
    teamId?: string
    questions?: Array<{
      id: string
      type: string
      label: string
      required: boolean
      placeholder?: string
      options?: string[]
    }>
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
  SKIPPED: {
    label: 'Skipped',
    icon: Clock,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
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
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [cancelScope, setCancelScope] = useState<'this' | 'future'>('this')

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
        body: JSON.stringify({
          cancelAllFuture: cancelScope === 'future',
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to cancel booking')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking', params.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: 'Booking cancelled',
        description: data.cancelledCount
          ? `${data.cancelledCount} booking(s) cancelled successfully.`
          : 'The booking has been cancelled successfully.',
      })
      setShowCancelDialog(false)
      setCancelScope('this')
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

  const confirmMutation = useMutation({
    mutationFn: async (scope: 'this' | 'all_pending' = 'this') => {
      const res = await fetch(`/api/bookings/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', scope }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to confirm booking')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking', params.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: data.updatedCount ? `${data.updatedCount} bookings confirmed` : 'Booking confirmed',
        description: 'The invitee will be notified.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ reason, scope = 'this' }: { reason: string; scope?: 'this' | 'all_pending' }) => {
      const res = await fetch(`/api/bookings/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason, scope }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to reject booking')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking', params.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: data.updatedCount ? `${data.updatedCount} bookings declined` : 'Booking declined',
        description: 'The invitee will be notified.',
      })
      setShowRejectDialog(false)
      setRejectReason('')
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

  const skipMutation = useMutation({
    mutationFn: async (action: 'skip' | 'unskip') => {
      const res = await fetch(`/api/bookings/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || `Failed to ${action} booking`)
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking', params.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['recurring-series'] })
      toast({
        title: data.status === 'SKIPPED' ? 'Occurrence skipped' : 'Occurrence restored',
        description: data.status === 'SKIPPED'
          ? 'This occurrence has been skipped. The rest of the series continues.'
          : 'This occurrence has been restored to confirmed.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Fetch available team members for MANAGED scheduling assignment
  const { data: availableMembersData } = useQuery({
    queryKey: ['booking-members', params.id],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${params.id}/assign`)
      if (!res.ok) return null
      return res.json() as Promise<{ availableMembers: TeamMember[] }>
    },
    enabled: bookingData?.eventType?.schedulingType === 'MANAGED',
  })

  const assignMemberMutation = useMutation({
    mutationFn: async (assignedUserId: string) => {
      const res = await fetch(`/api/bookings/${params.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUserId }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to assign member')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', params.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: 'Member assigned',
        description: 'The team member has been assigned to this booking.',
      })
      setShowAssignDialog(false)
      setSelectedMemberId(null)
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
            <CardTitle className="text-2xl flex items-center gap-3">
              {booking.eventType.title}
              {booking.recurringGroupId && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-ocean-100 text-ocean-700">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {(booking.recurringIndex ?? 0) + 1} of {booking.recurringCount ?? 0}
                </span>
              )}
            </CardTitle>
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

        {/* Recurring Series */}
        {booking.recurringGroupId && booking.recurringBookings && booking.recurringBookings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-ocean-600" />
                Recurring Series ({booking.recurringBookings.length} occurrences)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {booking.recurringBookings
                  .sort((a, b) => (a.recurringIndex ?? 0) - (b.recurringIndex ?? 0))
                  .map((occ) => {
                    const isCurrent = occ.id === booking.id
                    const occStatus = statusConfig[occ.status as keyof typeof statusConfig]
                    const OccStatusIcon = occStatus?.icon || Calendar

                    return (
                      <div
                        key={occ.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border transition-colors',
                          isCurrent ? 'bg-ocean-50 border-ocean-200' : 'hover:bg-gray-50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-gray-400 w-6 text-center">
                            {(occ.recurringIndex ?? 0) + 1}
                          </span>
                          <div>
                            <p className={cn('text-sm font-medium', isCurrent ? 'text-ocean-700' : 'text-gray-900')}>
                              {formatInTimeZone(new Date(occ.startTime), hostTimezone, 'EEE, MMM d, yyyy')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatInTimeZone(new Date(occ.startTime), hostTimezone, 'h:mm a')} - {formatInTimeZone(new Date(occ.endTime), hostTimezone, 'h:mm a')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                            occStatus?.className || 'bg-gray-100 text-gray-600'
                          )}>
                            <OccStatusIcon className="h-3 w-3" />
                            {occStatus?.label || occ.status}
                          </span>
                          {!isCurrent && (
                            <Link href={`/dashboard/bookings/${occ.uid}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] font-medium text-ocean-600 px-1.5">Current</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="mt-4 pt-4 border-t">
                <Link href={`/dashboard/bookings/series/${booking.recurringGroupId}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    View Full Series
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

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
                  {Object.entries(booking.responses).map(([questionId, value]) => {
                    // Find the question by ID to get the label
                    const question = booking.eventType.questions?.find(q => q.id === questionId)
                    const questionLabel = question?.label || questionId

                    return (
                      <div key={questionId}>
                        <p className="text-sm font-medium text-gray-700">{questionLabel}</p>
                        <p className="text-gray-600">{String(value)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Member Assignment for MANAGED scheduling */}
        {booking.eventType.schedulingType === 'MANAGED' && (
          <Card className={!booking.assignedUserId ? 'border-blue-200 bg-blue-50' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {booking.assignedUser ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={booking.assignedUser.image || undefined} />
                      <AvatarFallback>
                        {getInitials(booking.assignedUser.name || booking.assignedUser.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-gray-900">
                        {booking.assignedUser.name || 'Team Member'}
                      </p>
                      <p className="text-sm text-gray-500">{booking.assignedUser.email}</p>
                    </div>
                  </div>
                  {booking.status !== 'CANCELLED' && booking.status !== 'REJECTED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAssignDialog(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Reassign
                    </Button>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-blue-700 mb-4">
                    This booking requires a team member to be assigned. Please select who will handle this meeting.
                  </p>
                  <Button onClick={() => setShowAssignDialog(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Team Member
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pending Confirmation Actions */}
        {booking.status === 'PENDING' && (() => {
          const pendingCount = booking.recurringBookings?.filter(rb => rb.status === 'PENDING').length ?? 0
          const isRecurringSeries = booking.recurringGroupId && pendingCount > 1
          return (
            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-800">
                  <AlertCircle className="h-5 w-5" />
                  Action Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-yellow-700 mb-4">
                  {isRecurringSeries
                    ? `This recurring series has ${pendingCount} pending bookings awaiting your confirmation.`
                    : 'This booking request is awaiting your confirmation. Please confirm or decline this meeting.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => confirmMutation.mutate('this')}
                    disabled={confirmMutation.isPending || rejectMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {confirmMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Confirm This Booking
                  </Button>

                  {isRecurringSeries && (
                    <Button
                      onClick={() => confirmMutation.mutate('all_pending')}
                      disabled={confirmMutation.isPending || rejectMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {confirmMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Confirm All Pending ({pendingCount})
                    </Button>
                  )}

                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={confirmMutation.isPending || rejectMutation.isPending}
                  >
                    {rejectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-2" />
                    )}
                    Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })()}

        {/* Actions for confirmed bookings */}
        {booking.status === 'CONFIRMED' && (
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <AddToCalendar
                bookingUid={booking.uid}
                variant="outline"
              />

              <Link href={`/bookings/${booking.uid}/reschedule`}>
                <Button variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reschedule
                </Button>
              </Link>

              {booking.recurringGroupId && (
                <Button
                  variant="outline"
                  onClick={() => skipMutation.mutate('skip')}
                  disabled={skipMutation.isPending}
                >
                  {skipMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Clock className="h-4 w-4 mr-2" />
                  )}
                  Skip This Occurrence
                </Button>
              )}

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

        {/* Skipped occurrence — Restore action */}
        {booking.status === 'SKIPPED' && (
          <Card className="border-slate-200 bg-slate-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-700">
                <Clock className="h-5 w-5" />
                Occurrence Skipped
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 mb-4">
                This occurrence was skipped. The rest of the recurring series continues as normal.
              </p>
              <Button
                onClick={() => skipMutation.mutate('unskip')}
                disabled={skipMutation.isPending}
              >
                {skipMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Restore This Occurrence
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={(open) => {
        setShowCancelDialog(open)
        if (!open) setCancelScope('this')
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel your meeting with {booking.inviteeName}. They will be notified via email.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {booking.recurringGroupId && (
            <div className="py-2 space-y-2">
              <p className="text-sm font-medium text-gray-700">Cancellation scope:</p>
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="cancelScope"
                  value="this"
                  checked={cancelScope === 'this'}
                  onChange={() => setCancelScope('this')}
                  className="text-ocean-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Cancel this occurrence only</p>
                  <p className="text-xs text-gray-500">
                    Only occurrence {(booking.recurringIndex ?? 0) + 1} of {booking.recurringCount} will be cancelled
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="cancelScope"
                  value="future"
                  checked={cancelScope === 'future'}
                  onChange={() => setCancelScope('future')}
                  className="text-ocean-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Cancel this and all future occurrences</p>
                  <p className="text-xs text-gray-500">
                    All remaining occurrences from this date onward will be cancelled
                  </p>
                </div>
              </label>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelScope === 'future' ? 'Cancel All Future' : 'Cancel Booking'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline this booking request?</AlertDialogTitle>
            <AlertDialogDescription>
              This will decline the booking request from {booking.inviteeName}. They will be notified via email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason" className="text-sm font-medium">
              Reason (optional)
            </Label>
            <Textarea
              id="reject-reason"
              placeholder="Let the invitee know why you're declining..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectMutation.mutate({ reason: rejectReason, scope: 'this' })}
              className="bg-red-600 hover:bg-red-700"
            >
              Decline This Booking
            </AlertDialogAction>
            {booking.recurringGroupId && (booking.recurringBookings?.filter(rb => rb.status === 'PENDING').length ?? 0) > 1 && (
              <AlertDialogAction
                onClick={() => rejectMutation.mutate({ reason: rejectReason, scope: 'all_pending' })}
                className="bg-red-600 hover:bg-red-700"
              >
                Decline All Pending
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Team Member Assignment Dialog */}
      <AlertDialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Assign Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Select a team member to handle this booking. They will receive a notification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2 max-h-64 overflow-y-auto">
            {availableMembersData?.availableMembers?.map((member) => (
              <button
                key={member.userId}
                onClick={() => setSelectedMemberId(member.userId)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                  selectedMemberId === member.userId
                    ? 'border-ocean-500 bg-ocean-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={member.image || undefined} />
                  <AvatarFallback>
                    {getInitials(member.name || member.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {member.name || 'Team Member'}
                  </p>
                  <p className="text-sm text-gray-500 truncate">{member.email}</p>
                </div>
                {selectedMemberId === member.userId && (
                  <CheckCircle className="h-5 w-5 text-ocean-500 flex-shrink-0" />
                )}
              </button>
            ))}
            {(!availableMembersData?.availableMembers || availableMembersData.availableMembers.length === 0) && (
              <p className="text-center text-gray-500 py-4">No team members available</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedMemberId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedMemberId && assignMemberMutation.mutate(selectedMemberId)}
              disabled={!selectedMemberId || assignMemberMutation.isPending}
              className="bg-ocean-600 hover:bg-ocean-700"
            >
              {assignMemberMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Assign Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
