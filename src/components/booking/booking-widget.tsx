'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, startOfDay } from 'date-fns'
import { generateRecurringDates, FREQUENCY_LABELS, type RecurringFrequency } from '@/lib/recurring/utils'
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
  User,
  Users,
  Mail,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn, formatDuration, getInitials } from '@/lib/utils'

interface TimeSlot {
  time: string
  start: Date
  end: Date
  formattedTime: string
  seatsRemaining?: number
}

interface BookingWindow {
  type: 'ROLLING' | 'RANGE' | 'UNLIMITED'
  start: string
  end: string | null
}

interface BookingWidgetProps {
  user: {
    name: string
    username: string
    image: string | null
    timezone: string
  }
  eventType: {
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
    questions: Array<{
      id: string
      type: string
      label: string
      required: boolean
      placeholder?: string
      options?: string[]
    }>
  }
  isEmbed?: boolean
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

type BookingStep = 'calendar' | 'time' | 'details' | 'confirmation'

export default function BookingWidget({ user, eventType, isEmbed }: BookingWidgetProps) {
  const [step, setStep] = useState<BookingStep>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [inviteeTimezone, setInviteeTimezone] = useState<string>(
    () => typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
  )
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    notes: '',
    responses: {} as Record<string, string>,
  })
  const [bookingResult, setBookingResult] = useState<any>(null)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringWeeks, setRecurringWeeks] = useState(Math.min(4, eventType.recurringMaxWeeks || 12))

  // Detect user's timezone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setInviteeTimezone(tz)
  }, [])

  // Track booking window info from API
  const [bookingWindow, setBookingWindow] = useState<BookingWindow | null>(null)

  const frequency: RecurringFrequency = (eventType.recurringFrequency || 'weekly') as RecurringFrequency

  // Compute effective recurring sessions capped by booking window
  const maxRecurringWeeks = (() => {
    const hostMax = eventType.recurringMaxWeeks || 12
    if (selectedDate && bookingWindow?.end) {
      const windowEnd = new Date(bookingWindow.end)
      let maxFit = 1
      for (let n = 2; n <= hostMax; n++) {
        const dates = generateRecurringDates(selectedDate, { frequency, count: n, interval: eventType.recurringInterval })
        if (dates[dates.length - 1] <= windowEnd) {
          maxFit = n
        } else {
          break
        }
      }
      return Math.max(2, maxFit)
    }
    return hostMax
  })()
  const effectiveRecurringWeeks = Math.min(recurringWeeks, maxRecurringWeeks)

  // Fetch available slots for selected month only (lazy loading per month)
  const { data: slotsData, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: ['slots', eventType.id, format(currentMonth, 'yyyy-MM'), inviteeTimezone],
    queryFn: async () => {
      const monthStart = startOfMonth(currentMonth)
      const monthEnd = endOfMonth(currentMonth)

      // Only fetch if the month is potentially within booking window
      // We'll still make the request but the API will return empty slots if outside window
      const startDate = format(monthStart, 'yyyy-MM-dd')
      const endDate = format(monthEnd, 'yyyy-MM-dd')

      const params = new URLSearchParams({
        eventTypeId: eventType.id,
        startDate,
        endDate,
        timezone: inviteeTimezone,
      })

      const res = await fetch(`/api/slots?${params}`)

      if (!res.ok) {
        const errorText = await res.text()
        console.error('Slots API error:', res.status, errorText)
        throw new Error(`Failed to fetch slots: ${res.status} ${errorText}`)
      }

      const data = await res.json()

      // Save booking window info
      if (data.bookingWindow) {
        setBookingWindow(data.bookingWindow)
      }

      // Transform slots data - convert ISO strings to Date objects
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
                ...(slot.seatsRemaining != null && { seatsRemaining: slot.seatsRemaining }),
              }
            })
          }
        })
      }

      return { ...data, slots: transformedSlots }
    },
    enabled: !!inviteeTimezone,
    retry: 2,
    staleTime: 60000, // 1 minute - cache each month's data
  })

  // Book mutation
  const bookMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: eventType.id,
          startTime: selectedSlot,
          timezone: inviteeTimezone,
          name: formData.name,
          email: formData.email,
          notes: formData.notes || undefined,
          responses: Object.keys(formData.responses).length > 0
            ? formData.responses
            : undefined,
          ...(isRecurring && eventType.allowsRecurring && {
            recurring: {
              weeks: effectiveRecurringWeeks,
              frequency: eventType.recurringFrequency || 'weekly',
              ...(eventType.recurringFrequency === 'custom' && eventType.recurringInterval && {
                interval: eventType.recurringInterval,
              }),
            },
          }),
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to book')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setBookingResult(data)
      setStep('confirmation')
    },
  })

  // Calendar navigation
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const firstDayOfMonth = startOfMonth(currentMonth).getDay()
  const today = startOfDay(new Date())

  // Get slots for selected date
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const availableSlots: TimeSlot[] = selectedDateStr && slotsData?.slots?.[selectedDateStr]
    ? slotsData.slots[selectedDateStr]
    : []

  // Check if a date has slots
  const dateHasSlots = (date: Date): boolean => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return slotsData?.slots?.[dateStr]?.length > 0
  }

  // Check if a month is within the booking window
  const isMonthInBookingWindow = (monthDate: Date): boolean => {
    if (!bookingWindow) return true // Allow all if we don't have info yet

    const monthEnd = endOfMonth(monthDate)
    const windowStart = new Date(bookingWindow.start)

    // Month must end after window start
    if (monthEnd < windowStart) return false

    // If there's an end date, month must start before window end
    if (bookingWindow.end) {
      const windowEnd = new Date(bookingWindow.end)
      const monthStart = startOfMonth(monthDate)
      if (monthStart > windowEnd) return false
    }

    return true
  }

  // Check if we can navigate to previous month
  const canGoPrevMonth = (): boolean => {
    const prevMonth = addDays(startOfMonth(currentMonth), -1)
    // Can't go to months in the past
    if (endOfMonth(prevMonth) < today) return false
    return isMonthInBookingWindow(prevMonth)
  }

  // Check if we can navigate to next month
  const canGoNextMonth = (): boolean => {
    const nextMonth = addDays(endOfMonth(currentMonth), 1)
    return isMonthInBookingWindow(nextMonth)
  }

  const LocationIcon = locationIcons[eventType.locationType as keyof typeof locationIcons] || Globe

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setSelectedSlot(null)
    setStep('time')
  }

  const handleSlotSelect = (slot: string) => {
    setSelectedSlot(slot)
    setStep('details')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    bookMutation.mutate()
  }

  // Confirmation step
  const bookingData = bookingResult?.booking
  const isPending = bookingData?.status === 'PENDING'

  if (step === 'confirmation' && bookingData) {
    return (
      <div className={isEmbed ? 'max-w-lg mx-auto py-6 px-4' : 'max-w-lg mx-auto py-12 px-4'}>
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <div className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6',
              isPending ? 'bg-amber-100' : 'bg-green-100'
            )}>
              {isPending ? (
                <Clock className="h-8 w-8 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              )}
            </div>
            <h1 className="text-2xl font-heading font-bold text-gray-900 mb-2">
              {isPending ? 'Booking Requested' : 'You\u0027re booked!'}
            </h1>
            <p className="text-gray-600 mb-6">
              {isPending
                ? `Your booking is pending confirmation by ${user.name}. You\u0027ll receive an email once it\u0027s confirmed.`
                : `A calendar invitation has been sent to ${formData.email}`}
            </p>

            <div className="bg-gray-50 rounded-xl p-4 text-left mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.image || undefined} />
                  <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-gray-900">{eventType.title}</p>
                  <p className="text-sm text-gray-500">with {user.name}</p>
                </div>
              </div>

              {/* Recurring bookings: show all dates */}
              {bookingResult.isRecurring && bookingResult.recurringBookings ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-700 font-medium mb-1">
                    <RefreshCw className="h-4 w-4" />
                    {bookingResult.recurringBookings.length} {FREQUENCY_LABELS[frequency]?.toLowerCase() || 'recurring'} sessions
                  </div>
                  <div className="space-y-1.5 ml-6">
                    {bookingResult.recurringBookings.map((rb: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatInTimeZone(new Date(rb.startTime), inviteeTimezone, 'EEE, MMM d, yyyy')}
                        {' at '}
                        {formatInTimeZone(new Date(rb.startTime), inviteeTimezone, 'h:mm a')}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 mt-2">
                    <LocationIcon className="h-4 w-4" />
                    {locationLabels[eventType.locationType as keyof typeof locationLabels] || eventType.locationType}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    {formatInTimeZone(new Date(bookingData.startTime), inviteeTimezone, 'EEEE, MMMM d, yyyy')}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-4 w-4" />
                    {formatInTimeZone(new Date(bookingData.startTime), inviteeTimezone, 'h:mm a')} ({inviteeTimezone})
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <LocationIcon className="h-4 w-4" />
                    {locationLabels[eventType.locationType as keyof typeof locationLabels] || eventType.locationType}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {bookingData.meetingUrl && (
                <a
                  href={bookingData.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="w-full">
                    <Video className="h-4 w-4 mr-2" />
                    Join Meeting
                  </Button>
                </a>
              )}

              {isEmbed ? (
                <a href={`/bookings/${bookingData.uid}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="w-full">
                    <Calendar className="h-4 w-4 mr-2" />
                    Manage Booking
                  </Button>
                </a>
              ) : (
                <Link href={`/bookings/${bookingData.uid}`}>
                  <Button variant="outline" className="w-full">
                    <Calendar className="h-4 w-4 mr-2" />
                    Manage Booking
                  </Button>
                </Link>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep('calendar')
                  setSelectedDate(null)
                  setSelectedSlot(null)
                  setFormData({ name: '', email: '', notes: '', responses: {} })
                  setBookingResult(null)
                  setIsRecurring(false)
                }}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Book Another Time
              </Button>
            </div>
          </CardContent>
        </Card>

        {!isEmbed && (
          <div className="text-center mt-6">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
              <Image
                src="/logo.svg"
                alt="TimeTide"
                width={20}
                height={20}
              />
              TimeTide Powered by SeekaHost Technologies Ltd.
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={isEmbed ? 'max-w-4xl mx-auto px-2 py-2' : 'max-w-4xl mx-auto py-8 px-4'}>
      <Card className={cn('overflow-hidden', isEmbed && 'border-0 shadow-none')}>
        <div className="md:flex">
          {/* Left sidebar - Event info */}
          <div className="md:w-80 p-6 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200">
            <div className="flex items-center gap-3 mb-6">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.image || undefined} />
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-500">@{user.username}</p>
              </div>
            </div>

            <h1 className="text-xl font-heading font-bold text-gray-900 mb-2">
              {eventType.title}
            </h1>
            {eventType.description && (
              <p className="text-gray-600 text-sm mb-4">{eventType.description}</p>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4 text-ocean-500" />
                {formatDuration(eventType.length)}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <LocationIcon className="h-4 w-4 text-ocean-500" />
                {locationLabels[eventType.locationType as keyof typeof locationLabels] || eventType.locationType}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Globe className="h-4 w-4 text-ocean-500" />
                {inviteeTimezone}
              </div>
              {(eventType.seatsPerSlot ?? 1) > 1 && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Users className="h-4 w-4 text-ocean-500" />
                  Group event · {eventType.seatsPerSlot} seats
                </div>
              )}
            </div>

            {selectedDate && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500">Selected</p>
                <p className="font-medium text-gray-900">
                  {format(selectedDate, 'EEEE, MMMM d')}
                </p>
                {selectedSlot && (
                  <p className="text-ocean-600">
                    {formatInTimeZone(new Date(selectedSlot), inviteeTimezone, 'h:mm a')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right side - Calendar/Time/Form */}
          <div className="flex-1 p-6">
            {step === 'calendar' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Select a Date
                </h2>

                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}
                    disabled={!canGoPrevMonth()}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      canGoPrevMonth()
                        ? 'hover:bg-gray-100'
                        : 'opacity-30 cursor-not-allowed'
                    )}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="font-medium">
                    {format(currentMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
                    disabled={!canGoNextMonth()}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      canGoNextMonth()
                        ? 'hover:bg-gray-100'
                        : 'opacity-30 cursor-not-allowed'
                    )}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>

                {/* Calendar grid */}
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
                ) : slotsError ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                    <p className="text-red-600 text-center">
                      Failed to load available times
                    </p>
                    <p className="text-gray-500 text-sm text-center mt-2">
                      {slotsError instanceof Error ? slotsError.message : 'Please try again'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {/* Empty cells for days before month starts */}
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
                          onClick={() => handleDateSelect(day)}
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
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.time}
                        onClick={() => handleSlotSelect(slot.time)}
                        className={cn(
                          'time-slot',
                          selectedSlot === slot.time && 'time-slot-selected'
                        )}
                      >
                        <span>{slot.formattedTime}</span>
                        {slot.seatsRemaining != null && slot.seatsRemaining < (eventType.seatsPerSlot ?? 1) && (
                          <span className={cn(
                            'text-[10px] font-medium block leading-tight',
                            slot.seatsRemaining <= 2 ? 'text-amber-600' : 'text-gray-500'
                          )}>
                            {slot.seatsRemaining} {slot.seatsRemaining === 1 ? 'seat' : 'seats'} left
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 'details' && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={() => setStep('time')}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Enter Details
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="pl-10"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="pl-10"
                        placeholder="you@example.com"
                        required
                      />
                    </div>
                  </div>

                  {/* Custom questions */}
                  {eventType.questions.map((question) => (
                    <div key={question.id} className="space-y-2">
                      <Label>
                        {question.label}
                        {question.required && ' *'}
                      </Label>
                      {question.type === 'TEXT' || question.type === 'EMAIL' || question.type === 'PHONE' ? (
                        <Input
                          type={question.type === 'EMAIL' ? 'email' : question.type === 'PHONE' ? 'tel' : 'text'}
                          value={formData.responses[question.id] || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              responses: { ...formData.responses, [question.id]: e.target.value },
                            })
                          }
                          placeholder={question.placeholder}
                          required={question.required}
                        />
                      ) : question.type === 'TEXTAREA' ? (
                        <textarea
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          rows={3}
                          value={formData.responses[question.id] || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              responses: { ...formData.responses, [question.id]: e.target.value },
                            })
                          }
                          placeholder={question.placeholder}
                          required={question.required}
                        />
                      ) : question.type === 'SELECT' && question.options ? (
                        <select
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          value={formData.responses[question.id] || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              responses: { ...formData.responses, [question.id]: e.target.value },
                            })
                          }
                          required={question.required}
                        >
                          <option value="">Select an option</option>
                          {question.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ))}

                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <textarea
                      id="notes"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      rows={3}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Anything you'd like to share before the meeting..."
                    />
                  </div>

                  {/* Recurring booking option */}
                  {eventType.allowsRecurring && (
                    <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5" />
                            Make this recurring
                          </p>
                          <p className="text-xs text-gray-500">
                            Book this time slot {FREQUENCY_LABELS[frequency]?.toLowerCase() || 'recurring'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsRecurring(!isRecurring)}
                          className={cn(
                            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                            isRecurring ? 'bg-ocean-500' : 'bg-gray-200'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                              isRecurring ? 'translate-x-6' : 'translate-x-1'
                            )}
                          />
                        </button>
                      </div>
                      {isRecurring && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Number of sessions</label>
                          <select
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                            value={effectiveRecurringWeeks}
                            onChange={(e) => setRecurringWeeks(parseInt(e.target.value))}
                          >
                            {Array.from({ length: maxRecurringWeeks - 1 }, (_, i) => i + 2).map(n => (
                              <option key={n} value={n}>{n} sessions</option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500">
                            This will book {effectiveRecurringWeeks} sessions ({FREQUENCY_LABELS[frequency]?.toLowerCase() || 'recurring'})
                          </p>
                          {maxRecurringWeeks < (eventType.recurringMaxWeeks || 12) && (
                            <p className="text-xs text-amber-600">
                              Limited to {maxRecurringWeeks} sessions based on the available booking window
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {bookMutation.error && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-red-600 text-sm">
                        {bookMutation.error instanceof Error
                          ? bookMutation.error.message
                          : 'Something went wrong. Please try again.'}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={bookMutation.isPending}
                  >
                    {bookMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {isRecurring ? `Booking ${effectiveRecurringWeeks} sessions...` : 'Booking...'}
                      </>
                    ) : (
                      isRecurring ? `Confirm ${effectiveRecurringWeeks} Bookings` : 'Confirm Booking'
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </Card>

      {!isEmbed && (
        <div className="text-center mt-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
            <Image
              src="/logo.svg"
              alt="TimeTide"
              width={20}
              height={20}
            />
            TimeTide Powered by SeekaHost Technologies Ltd.
          </Link>
        </div>
      )}
    </div>
  )
}