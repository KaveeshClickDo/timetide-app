'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, startOfDay } from 'date-fns'
import Link from 'next/link'
import {
  Clock,
  Globe,
  Video,
  MapPin,
  Phone,
  ChevronLeft,
  ChevronRight,
  Waves,
  Loader2,
  CheckCircle2,
  Calendar,
  User,
  Mail,
  AlertCircle,
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
    questions: Array<{
      id: string
      type: string
      label: string
      required: boolean
      placeholder?: string
      options?: string[]
    }>
  }
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

export default function BookingWidget({ user, eventType }: BookingWidgetProps) {
  const [step, setStep] = useState<BookingStep>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [inviteeTimezone, setInviteeTimezone] = useState<string>('UTC')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    notes: '',
    responses: {} as Record<string, string>,
  })
  const [bookingResult, setBookingResult] = useState<any>(null)

  // Detect user's timezone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setInviteeTimezone(tz)
  }, [])

  // Fetch available slots for selected month
  const { data: slotsData, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: ['slots', eventType.id, format(currentMonth, 'yyyy-MM'), inviteeTimezone],
    queryFn: async () => {
      const startDate = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
      const endDate = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
      const params = new URLSearchParams({
        eventTypeId: eventType.id,
        startDate,
        endDate,
        timezone: inviteeTimezone,
      })
      
      console.log('Fetching slots with params:', params.toString())
      
      const res = await fetch(`/api/slots?${params}`)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error('Slots API error:', res.status, errorText)
        throw new Error(`Failed to fetch slots: ${res.status} ${errorText}`)
      }
      
      const data = await res.json()
      console.log('Slots data received:', data)

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
                formattedTime: format(startDate, 'h:mm a')
              }
            })
          }
        })
      }

      console.log('Transformed slots:', transformedSlots)
      return { ...data, slots: transformedSlots }
    },
    enabled: !!inviteeTimezone,
    retry: 2,
    staleTime: 60000, // 1 minute
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
          inviteeName: formData.name,
          inviteeEmail: formData.email,
          notes: formData.notes || undefined,
          responses: Object.keys(formData.responses).length > 0 ? formData.responses : undefined,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to book')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setBookingResult(data.booking)
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
  if (step === 'confirmation' && bookingResult) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-heading font-bold text-gray-900 mb-2">
              You&apos;re booked!
            </h1>
            <p className="text-gray-600 mb-6">
              A calendar invitation has been sent to {formData.email}
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
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(bookingResult.startTime), 'EEEE, MMMM d, yyyy')}
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="h-4 w-4" />
                  {format(new Date(bookingResult.startTime), 'h:mm a')} ({inviteeTimezone})
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <LocationIcon className="h-4 w-4" />
                  {locationLabels[eventType.locationType as keyof typeof locationLabels] || eventType.locationType}
                </div>
              </div>
            </div>

            {bookingResult.meetingUrl && (
              <a
                href={bookingResult.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="w-full">
                  <Video className="h-4 w-4 mr-2" />
                  Join Meeting
                </Button>
              </a>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
            <Waves className="h-4 w-4" />
            Powered by TimeTide
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <Card className="overflow-hidden">
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
            </div>

            {selectedDate && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500">Selected</p>
                <p className="font-medium text-gray-900">
                  {format(selectedDate, 'EEEE, MMMM d')}
                </p>
                {selectedSlot && (
                  <p className="text-ocean-600">
                    {format(new Date(selectedSlot), 'h:mm a')}
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
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="font-medium">
                    {format(currentMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
                    className="p-2 hover:bg-gray-100 rounded-lg"
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
                        {slot.formattedTime}
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
                        Booking...
                      </>
                    ) : (
                      'Confirm Booking'
                    )}
                  </Button>
                </form>
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="text-center mt-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <Waves className="h-4 w-4" />
          Powered by TimeTide
        </Link>
      </div>
    </div>
  )
}