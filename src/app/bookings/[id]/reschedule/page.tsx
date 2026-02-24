'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  format,
  addDays,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isBefore,
  startOfDay,
} from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import Link from 'next/link'
import Image from 'next/image'
import {
  Clock,
  Globe,
  Video,
  MapPin,
  Phone,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Calendar,
  AlertCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn, formatDuration, getInitials } from '@/lib/utils'

interface TimeSlot {
  time: string
  start: Date
  end: Date
  formattedTime: string
}

const locationIcons = {
  GOOGLE_MEET: Video,
  ZOOM: Video,
  TEAMS: Video,
  PHONE: Phone,
  IN_PERSON: MapPin,
  CUSTOM: Globe,
}

const locationLabels = {
  GOOGLE_MEET: 'Google Meet',
  ZOOM: 'Zoom',
  TEAMS: 'Microsoft Teams',
  PHONE: 'Phone Call',
  IN_PERSON: 'In Person',
  CUSTOM: 'Custom Location',
}

export default function ReschedulePage() {
  const params = useParams()
  const bookingId = params.id as string

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [inviteeTimezone, setInviteeTimezone] = useState<string>('UTC')
  const [step, setStep] = useState<'calendar' | 'time' | 'confirm' | 'success'>('calendar')

  // Detect timezone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setInviteeTimezone(tz)
  }, [])

  // Fetch booking details
  const { data: bookingData, isLoading: bookingLoading, error: bookingError } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}`)
      if (!res.ok) throw new Error('Booking not found')
      return res.json()
    },
  })

  const booking = bookingData?.booking

  // Fetch available slots for selected month
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['slots', booking?.eventType?.id, format(currentMonth, 'yyyy-MM'), inviteeTimezone],
    queryFn: async () => {
      const monthStart = startOfMonth(currentMonth)
      const monthEnd = endOfMonth(currentMonth)

      const params = new URLSearchParams({
        eventTypeId: booking.eventType.id,
        startDate: format(monthStart, 'yyyy-MM-dd'),
        endDate: format(monthEnd, 'yyyy-MM-dd'),
        timezone: inviteeTimezone,
      })

      const res = await fetch(`/api/slots?${params}`)
      if (!res.ok) throw new Error('Failed to fetch slots')
      const data = await res.json()

      // Transform slots
      const transformedSlots: Record<string, TimeSlot[]> = {}
      if (data.slots && typeof data.slots === 'object') {
        Object.keys(data.slots).forEach((dateKey) => {
          const daySlots = data.slots[dateKey]
          if (Array.isArray(daySlots)) {
            transformedSlots[dateKey] = daySlots.map((slot: any) => {
              const startDate = new Date(slot.start)
              const endDate = new Date(slot.end)
              return {
                time: slot.start,
                start: startDate,
                end: endDate,
                formattedTime: formatInTimeZone(startDate, inviteeTimezone, 'h:mm a'),
              }
            })
          }
        })
      }

      return { ...data, slots: transformedSlots }
    },
    enabled: !!booking?.eventType?.id && !!inviteeTimezone,
  })

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/bookings/${bookingId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStartTime: selectedSlot,
          reason: reason || undefined,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to reschedule')
      }
      return res.json()
    },
    onSuccess: () => {
      setStep('success')
    },
  })

  // Calendar logic
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })
  const firstDayOfMonth = startOfMonth(currentMonth).getDay()
  const today = startOfDay(new Date())

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const availableSlots: TimeSlot[] =
    selectedDateStr && slotsData?.slots?.[selectedDateStr]
      ? slotsData.slots[selectedDateStr]
      : []

  const dateHasSlots = (date: Date): boolean => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return slotsData?.slots?.[dateStr]?.length > 0
  }

  const canGoPrevMonth = (): boolean => {
    const prevMonth = addDays(startOfMonth(currentMonth), -1)
    return endOfMonth(prevMonth) >= today
  }

  // Check if the selected slot is the same as the current booking time
  const isCurrentBookingTime = (slotTime: string): boolean => {
    if (!booking) return false
    return new Date(slotTime).getTime() === new Date(booking.startTime).getTime()
  }

  const LocationIcon = booking
    ? locationIcons[booking.eventType.locationType as keyof typeof locationIcons] || Globe
    : Globe

  // Loading state
  if (bookingLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    )
  }

  // Error state
  if (bookingError || !booking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Booking Not Found</h1>
            <p className="text-gray-600">This booking doesn&apos;t exist or can&apos;t be rescheduled.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Can't reschedule if not PENDING or CONFIRMED
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Can&apos;t Reschedule</h1>
            <p className="text-gray-600">
              This booking is {booking.status.toLowerCase()} and can&apos;t be rescheduled.
            </p>
            <Link href={`/bookings/${bookingId}`}>
              <Button variant="outline" className="mt-4">
                View Booking
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-heading font-bold text-gray-900 mb-2">
                Booking Rescheduled!
              </h1>
              <p className="text-gray-600 mb-6">
                Your meeting has been moved. A confirmation email has been sent to both parties.
              </p>

              <div className="bg-gray-50 rounded-xl p-4 text-left mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={booking.host?.image || undefined} />
                    <AvatarFallback>{getInitials(booking.host?.name || '')}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-gray-900">{booking.eventType.title}</p>
                    <p className="text-sm text-gray-500">with {booking.host?.name}</p>
                  </div>
                </div>

                {/* Old time */}
                <div className="mb-3 p-2 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-xs text-red-500 font-medium mb-1">Previous time</p>
                  <p className="text-sm text-red-700 line-through">
                    {formatInTimeZone(new Date(booking.startTime), inviteeTimezone, 'EEEE, MMMM d, yyyy h:mm a')}
                  </p>
                </div>

                {/* New time */}
                <div className="p-2 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-xs text-green-500 font-medium mb-1">New time</p>
                  <p className="text-sm text-green-700 font-medium">
                    {selectedSlot && formatInTimeZone(new Date(selectedSlot), inviteeTimezone, 'EEEE, MMMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>

              <Link href={`/bookings/${bookingId}`}>
                <Button className="w-full">View Booking</Button>
              </Link>
            </CardContent>
          </Card>

          <div className="text-center mt-6">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <Image src="/logo.svg" alt="TimeTide" width={20} height={20} />
              TimeTide Powered by SeekaHost Technologies Ltd.
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-ocean-50 via-white to-sunset-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card className="overflow-hidden">
          <div className="md:flex">
            {/* Left sidebar - Current booking info */}
            <div className="md:w-80 p-6 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200">
              <div className="flex items-center gap-2 text-ocean-600 mb-6">
                <RefreshCw className="h-5 w-5" />
                <span className="font-semibold text-sm">Reschedule Booking</span>
              </div>

              <div className="flex items-center gap-3 mb-6">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={booking.host?.image || undefined} />
                  <AvatarFallback>{getInitials(booking.host?.name || '')}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-900">{booking.host?.name}</p>
                </div>
              </div>

              <h1 className="text-xl font-heading font-bold text-gray-900 mb-4">
                {booking.eventType.title}
              </h1>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="h-4 w-4 text-ocean-500" />
                  {formatDuration(booking.eventType.length)}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <LocationIcon className="h-4 w-4 text-ocean-500" />
                  {locationLabels[booking.eventType.locationType as keyof typeof locationLabels] || booking.eventType.locationType}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Globe className="h-4 w-4 text-ocean-500" />
                  {inviteeTimezone}
                </div>
              </div>

              {/* Current booking time */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-xs text-gray-500 font-medium mb-2">CURRENT TIME</p>
                <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm font-medium text-yellow-800">
                    {formatInTimeZone(new Date(booking.startTime), inviteeTimezone, 'EEEE, MMMM d')}
                  </p>
                  <p className="text-sm text-yellow-700">
                    {formatInTimeZone(new Date(booking.startTime), inviteeTimezone, 'h:mm a')} -{' '}
                    {formatInTimeZone(new Date(booking.endTime), inviteeTimezone, 'h:mm a')}
                  </p>
                </div>
              </div>

              {/* New selected time */}
              {selectedSlot && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-medium mb-2">NEW TIME</p>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm font-medium text-green-800">
                      {selectedSlot && formatInTimeZone(new Date(selectedSlot), inviteeTimezone, 'EEEE, MMMM d')}
                    </p>
                    <p className="text-sm text-green-700">
                      {formatInTimeZone(new Date(selectedSlot), inviteeTimezone, 'h:mm a')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right side - Calendar / Time / Confirm */}
            <div className="flex-1 p-6">
              {step === 'calendar' && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    Select a New Date
                  </h2>

                  {/* Month navigation */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}
                      disabled={!canGoPrevMonth()}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        canGoPrevMonth() ? 'hover:bg-gray-100' : 'opacity-30 cursor-not-allowed'
                      )}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className="font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
                    <button
                      onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-1 text-center text-sm mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day} className="py-2 text-gray-500 font-medium">
                        {day}
                      </div>
                    ))}
                  </div>

                  {slotsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                        <div key={`empty-${i}`} className="p-2" />
                      ))}
                      {days.map((day) => {
                        const isDisabled = isBefore(day, today)
                        const hasSlots = !isDisabled && dateHasSlots(day)
                        const isSelected = selectedDate && isSameDay(day, selectedDate)
                        const isCurrentDay = isSameDay(day, today)

                        return (
                          <button
                            key={day.toISOString()}
                            disabled={isDisabled || !hasSlots}
                            onClick={() => {
                              setSelectedDate(day)
                              setSelectedSlot(null)
                              setStep('time')
                            }}
                            className={cn(
                              'p-2 rounded-lg text-sm transition-colors relative',
                              isSelected
                                ? 'bg-ocean-500 text-white'
                                : hasSlots
                                  ? 'hover:bg-ocean-100 text-gray-900 font-medium'
                                  : 'text-gray-300 cursor-not-allowed',
                              isCurrentDay && !isSelected && 'ring-2 ring-ocean-500 ring-offset-2'
                            )}
                          >
                            {format(day, 'd')}
                            {hasSlots && !isSelected && (
                              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-ocean-500 rounded-full" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {step === 'time' && selectedDate && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setStep('calendar')}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {format(selectedDate, 'EEEE, MMMM d')}
                    </h2>
                  </div>

                  {availableSlots.length === 0 ? (
                    <p className="text-gray-500 py-8 text-center">
                      No available times on this date
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                      {availableSlots.map((slot) => {
                        const isCurrent = isCurrentBookingTime(slot.time)
                        return (
                          <button
                            key={slot.time}
                            disabled={isCurrent}
                            onClick={() => {
                              setSelectedSlot(slot.time)
                              setStep('confirm')
                            }}
                            className={cn(
                              'time-slot',
                              isCurrent && 'opacity-40 cursor-not-allowed line-through',
                              selectedSlot === slot.time && 'time-slot-selected'
                            )}
                            title={isCurrent ? 'Current booking time' : undefined}
                          >
                            {slot.formattedTime}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {step === 'confirm' && selectedSlot && (
                <div>
                  <div className="flex items-center gap-2 mb-6">
                    <button
                      onClick={() => setStep('time')}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Confirm Reschedule
                    </h2>
                  </div>

                  {/* Time comparison */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-4">
                      {/* Old time */}
                      <div className="flex-1 p-3 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-xs text-red-500 font-medium mb-1">Previous</p>
                        <p className="text-sm text-red-700 line-through">
                          {formatInTimeZone(new Date(booking.startTime), inviteeTimezone, 'MMM d, h:mm a')}
                        </p>
                      </div>

                      <ArrowRight className="h-5 w-5 text-gray-400 shrink-0" />

                      {/* New time */}
                      <div className="flex-1 p-3 bg-green-50 rounded-lg border border-green-100">
                        <p className="text-xs text-green-500 font-medium mb-1">New</p>
                        <p className="text-sm text-green-700 font-medium">
                          {formatInTimeZone(new Date(selectedSlot), inviteeTimezone, 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="mb-6 space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Reason for rescheduling (optional)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Let them know why you're rescheduling..."
                      maxLength={500}
                    />
                  </div>

                  {rescheduleMutation.error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-red-600 text-sm">
                        {rescheduleMutation.error instanceof Error
                          ? rescheduleMutation.error.message
                          : 'Something went wrong. Please try again.'}
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => rescheduleMutation.mutate()}
                    disabled={rescheduleMutation.isPending}
                  >
                    {rescheduleMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Rescheduling...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Confirm Reschedule
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="text-center mt-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
            <Image src="/logo.svg" alt="TimeTide" width={20} height={20} />
            TimeTide Powered by SeekaHost Technologies Ltd.
          </Link>
        </div>
      </div>
    </div>
  )
}
