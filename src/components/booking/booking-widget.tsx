'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { generateRecurringDates, FREQUENCY_LABELS, type RecurringFrequency } from '@/lib/scheduling/recurring/utils'
import { formatInTimeZone } from 'date-fns-tz'
import Link from 'next/link'
import {
  Clock,
  Globe,
  Video,
  Users,
  ChevronLeft,
  CheckCircle2,
  Calendar,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn, formatDuration, getInitials } from '@/lib/utils'
import EmailVerification, { type VerificationProof } from '@/components/booking/email-verification'
import BookingCalendar from '@/components/booking/booking-calendar'
import BookingTimeSlots from '@/components/booking/booking-time-slots'
import BookingForm from '@/components/booking/booking-form'
import BookingFooter from '@/components/booking/booking-footer'
import { locationIcons, locationLabels } from '@/components/booking/booking-constants'
import type { TimeSlot, BookingWindow, BookingStep, SchedulingType } from '@/types/booking'
import type { TeamMemberBooking } from '@/types/team'
import type { Question } from '@/types/event-type'

// ============================================================================
// TYPES
// ============================================================================

interface SharedEventType {
  id: string
  title: string
  description: string | null
  length: number
  locationType: string
  seatsPerSlot?: number
  questions: Question[]
}

interface UserVariantProps {
  variant: 'user'
  user: {
    name: string
    username: string
    image: string | null
    timezone: string
  }
  eventType: SharedEventType & {
    allowsRecurring?: boolean
    recurringMaxWeeks?: number
    recurringFrequency?: string
    recurringInterval?: number
  }
  isEmbed?: boolean
}

interface TeamVariantProps {
  variant: 'team'
  team: {
    id: string
    name: string
    slug: string
    logo: string | null
  }
  eventType: SharedEventType & {
    slug: string
    schedulingType: SchedulingType | null
  }
  members: TeamMemberBooking[]
  defaultTimezone: string
  isEmbed?: boolean
}

export type BookingWidgetProps = UserVariantProps | TeamVariantProps

const schedulingTypeLabels = {
  ROUND_ROBIN: 'Round Robin',
  COLLECTIVE: 'Collective',
  MANAGED: 'Managed',
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function BookingWidget(props: BookingWidgetProps) {
  const { eventType, isEmbed } = props
  const isTeam = props.variant === 'team'

  // Display info derived from variant
  const displayName = isTeam ? props.team.name : props.user.name
  const displaySubtitle = isTeam ? 'Team' : `@${props.user.username}`

  // ── State ──────────────────────────────────────────────────────────────────
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
  const [showVerification, setShowVerification] = useState(false)
  const [verificationProof, setVerificationProof] = useState<VerificationProof | null>(null)
  const [bookingWindow, setBookingWindow] = useState<BookingWindow | null>(null)

  // Recurring state (user variant only)
  const [isRecurring, setIsRecurring] = useState(false)
  const allowsRecurring = !isTeam && props.eventType.allowsRecurring
  const recurringMaxWeeksHost = !isTeam ? (props.eventType.recurringMaxWeeks || 12) : 12
  const [recurringWeeks, setRecurringWeeks] = useState(Math.min(4, recurringMaxWeeksHost))
  const frequency: RecurringFrequency = (!isTeam ? (props.eventType.recurringFrequency || 'weekly') : 'weekly') as RecurringFrequency

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setInviteeTimezone(tz)
  }, [])

  // ── Recurring session cap ─────────────────────────────────────────────────
  const maxRecurringWeeks = (() => {
    if (!allowsRecurring) return 2
    const hostMax = recurringMaxWeeksHost
    if (selectedDate && bookingWindow?.end) {
      const windowEnd = new Date(bookingWindow.end)
      let maxFit = 1
      for (let n = 2; n <= hostMax; n++) {
        const dates = generateRecurringDates(selectedDate, {
          frequency,
          count: n,
          interval: !isTeam ? props.eventType.recurringInterval : undefined,
        })
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

  // ── Slots query ───────────────────────────────────────────────────────────
  const slotsQueryKey = isTeam
    ? ['team-slots', props.team.slug, props.eventType.slug, format(currentMonth, 'yyyy-MM'), inviteeTimezone]
    : ['slots', eventType.id, format(currentMonth, 'yyyy-MM'), inviteeTimezone]

  const { data: slotsData, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: slotsQueryKey,
    queryFn: async () => {
      const monthStart = startOfMonth(currentMonth)
      const monthEnd = endOfMonth(currentMonth)
      const startDate = format(monthStart, 'yyyy-MM-dd')
      const endDate = format(monthEnd, 'yyyy-MM-dd')

      let url: string
      if (isTeam) {
        const params = new URLSearchParams({
          teamSlug: props.team.slug,
          eventSlug: props.eventType.slug,
          startDate,
          endDate,
          timezone: inviteeTimezone,
        })
        url = `/api/slots/team?${params}`
      } else {
        const params = new URLSearchParams({
          eventTypeId: eventType.id,
          startDate,
          endDate,
          timezone: inviteeTimezone,
        })
        url = `/api/slots?${params}`
      }

      const res = await fetch(url)
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Failed to fetch slots: ${res.status} ${errorText}`)
      }

      const data = await res.json()
      if (data.bookingWindow) {
        setBookingWindow(data.bookingWindow)
      }

      const transformedSlots: Record<string, TimeSlot[]> = {}
      if (data.slots && typeof data.slots === 'object') {
        Object.keys(data.slots).forEach((dateKey) => {
          const daySlots = data.slots[dateKey]
          if (Array.isArray(daySlots)) {
            transformedSlots[dateKey] = daySlots.map((slot: any) => {
              const slotStart = new Date(slot.start)
              return {
                time: slot.start,
                start: slotStart,
                end: new Date(slot.end),
                formattedTime: formatInTimeZone(slotStart, inviteeTimezone, 'h:mm a'),
                ...(slot.assignedMemberId && { assignedMemberId: slot.assignedMemberId }),
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
    staleTime: 60000,
  })

  // ── Booking mutation ──────────────────────────────────────────────────────
  const bookMutation = useMutation({
    mutationFn: async (proof: VerificationProof) => {
      const payload: Record<string, unknown> = {
        eventTypeId: eventType.id,
        startTime: selectedSlot,
        timezone: inviteeTimezone,
        name: formData.name,
        email: formData.email,
        notes: formData.notes || undefined,
        responses: Object.keys(formData.responses).length > 0 ? formData.responses : undefined,
        emailVerification: {
          code: proof.code,
          signature: proof.signature,
          expiresAt: proof.expiresAt,
        },
      }

      if (isTeam) {
        payload.isTeamBooking = true
      }

      if (!isTeam && isRecurring && props.eventType.allowsRecurring) {
        payload.recurring = {
          weeks: effectiveRecurringWeeks,
          frequency: props.eventType.recurringFrequency || 'weekly',
          ...(props.eventType.recurringFrequency === 'custom' && props.eventType.recurringInterval && {
            interval: props.eventType.recurringInterval,
          }),
        }
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  // ── Derived state ─────────────────────────────────────────────────────────
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const availableSlots: TimeSlot[] = selectedDateStr && slotsData?.slots?.[selectedDateStr]
    ? slotsData.slots[selectedDateStr]
    : []

  const dateHasSlots = (date: Date): boolean => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return slotsData?.slots?.[dateStr]?.length > 0
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
    setShowVerification(true)
  }

  const handleEmailVerified = (proof: VerificationProof) => {
    setVerificationProof(proof)
    bookMutation.mutate(proof)
  }

  // ── Confirmation data ─────────────────────────────────────────────────────
  const bookingData = bookingResult?.booking
  const isPending = bookingData?.status === 'PENDING'

  // ========================================================================
  // CONFIRMATION STEP
  // ========================================================================
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
              {isPending ? 'Booking Requested' : 'You\'re booked!'}
            </h1>
            <p className="text-gray-600 mb-6">
              {isPending
                ? `Your booking is pending confirmation by ${displayName}. You'll receive an email once it's confirmed.`
                : `A calendar invitation has been sent to ${formData.email}`}
            </p>

            <div className="bg-gray-50 rounded-xl p-4 text-left mb-6">
              <div className="flex items-center gap-3 mb-4">
                {isTeam ? (
                  props.team.logo ? (
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={props.team.logo} />
                      <AvatarFallback>{getInitials(props.team.name)}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-ocean-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-ocean-600" />
                    </div>
                  )
                ) : (
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={props.user.image || undefined} />
                    <AvatarFallback>{getInitials(props.user.name)}</AvatarFallback>
                  </Avatar>
                )}
                <div>
                  <p className="font-medium text-gray-900">{eventType.title}</p>
                  <p className="text-sm text-gray-500">with {displayName}</p>
                </div>
              </div>

              {/* Recurring bookings: show all dates (user variant only) */}
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

            <div className="flex flex-col gap-3">
              {!isPending && bookingData.meetingUrl && (
                <a href={bookingData.meetingUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <Button className="w-full">
                    <Video className="h-4 w-4 mr-2" />
                    Join Meeting
                  </Button>
                </a>
              )}

              {isEmbed ? (
                <a href={`/bookings/${bookingData.uid}`} target="_blank" rel="noopener noreferrer" className="block">
                  <Button variant="outline" className="w-full">
                    <Calendar className="h-4 w-4 mr-2" />
                    Manage Booking
                  </Button>
                </a>
              ) : (
                <Link href={`/bookings/${bookingData.uid}`} className="block">
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

        {!isEmbed && <BookingFooter />}
      </div>
    )
  }

  // ========================================================================
  // MAIN BOOKING FLOW
  // ========================================================================
  return (
    <div className={isEmbed ? 'max-w-4xl mx-auto px-2 py-2' : 'max-w-4xl mx-auto py-8 px-4'}>
      <Card className={cn('overflow-hidden', isEmbed && 'border-0 shadow-none')}>
        <div className="md:flex">
          {/* Left sidebar - Event info */}
          <div className="md:w-80 p-6 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200">
            {/* Header: user avatar or team logo */}
            <div className="flex items-center gap-3 mb-6">
              {isTeam ? (
                props.team.logo ? (
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={props.team.logo} />
                    <AvatarFallback>{getInitials(props.team.name)}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-12 w-12 rounded-full bg-ocean-100 flex items-center justify-center">
                    <Users className="h-6 w-6 text-ocean-600" />
                  </div>
                )
              ) : (
                <Avatar className="h-12 w-12">
                  <AvatarImage src={props.user.image || undefined} />
                  <AvatarFallback>{getInitials(props.user.name)}</AvatarFallback>
                </Avatar>
              )}
              <div>
                <p className="font-medium text-gray-900">{displayName}</p>
                <p className="text-sm text-gray-500">{displaySubtitle}</p>
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
              {isTeam && props.eventType.schedulingType && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Users className="h-4 w-4 text-ocean-500" />
                  {schedulingTypeLabels[props.eventType.schedulingType]}
                </div>
              )}
              {(eventType.seatsPerSlot ?? 1) > 1 && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Users className="h-4 w-4 text-ocean-500" />
                  Group event · {eventType.seatsPerSlot} seats
                </div>
              )}
            </div>

            {/* Team members (team variant only) */}
            {isTeam && props.members.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500 mb-3">Team Members</p>
                <div className="flex flex-wrap gap-2">
                  {props.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 bg-white rounded-full px-3 py-1 border"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.image || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(member.name || 'Member')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-700">
                        {member.name || 'Team Member'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
              <BookingCalendar
                currentMonth={currentMonth}
                setCurrentMonth={setCurrentMonth}
                selectedDate={selectedDate}
                slotsLoading={slotsLoading}
                slotsError={slotsError as Error | null}
                dateHasSlots={dateHasSlots}
                bookingWindow={bookingWindow}
                onDateSelect={handleDateSelect}
              />
            )}

            {step === 'time' && selectedDate && (
              <BookingTimeSlots
                selectedDate={selectedDate}
                availableSlots={availableSlots}
                selectedSlot={selectedSlot}
                seatsPerSlot={eventType.seatsPerSlot}
                onSlotSelect={handleSlotSelect}
                onBack={() => setStep('calendar')}
              />
            )}

            {step === 'details' && (
              <BookingForm
                formData={formData}
                setFormData={setFormData}
                questions={eventType.questions}
                onSubmit={handleSubmit}
                onBack={() => setStep('time')}
                isPending={bookMutation.isPending}
                error={bookMutation.error as Error | null}
                submitLabel={isRecurring && allowsRecurring ? `Confirm ${effectiveRecurringWeeks} Bookings` : 'Confirm Booking'}
                pendingLabel={isRecurring && allowsRecurring ? `Booking ${effectiveRecurringWeeks} sessions...` : 'Booking...'}
              >
                {/* Recurring booking option (user variant only) */}
                {allowsRecurring && (
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
                        {!isTeam && maxRecurringWeeks < (props.eventType.recurringMaxWeeks || 12) && (
                          <p className="text-xs text-amber-600">
                            Limited to {maxRecurringWeeks} sessions based on the available booking window
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </BookingForm>
            )}
          </div>
        </div>
      </Card>

      {!isEmbed && <BookingFooter />}

      <EmailVerification
        open={showVerification}
        onOpenChange={setShowVerification}
        email={formData.email}
        type="BOOKING_CREATE"
        onVerified={handleEmailVerified}
      />
    </div>
  )
}
