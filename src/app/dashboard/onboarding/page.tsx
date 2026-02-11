'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Globe,
  Link as LinkIcon,
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Copy,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { TIMEZONES } from '@/lib/constants'
import { useIntegrationStatus } from '@/hooks/use-integration-status'
import { IntegrationConnectCard } from '@/components/integration-connect-card'

const STEPS = [
  { id: 1, title: 'Timezone', icon: Globe },
  { id: 2, title: 'Availability', icon: Clock },
  { id: 3, title: 'Booking Link', icon: LinkIcon },
  { id: 4, title: 'Event Types', icon: Calendar },
  { id: 5, title: 'Integrations', icon: Zap },
]

const DAYS = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
]

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2)
  const minutes = i % 2 === 0 ? '00' : '30'
  const time = `${hours.toString().padStart(2, '0')}:${minutes}`
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  const ampm = hours < 12 ? 'AM' : 'PM'
  return {
    value: time,
    label: `${displayHours}:${minutes} ${ampm}`,
  }
})

interface EventType {
  id: string
  title: string
  slug: string
  length: number
  isActive: boolean
}

interface AvailabilitySlot {
  id?: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface Schedule {
  id: string
  name: string
  isDefault: boolean
  slots: AvailabilitySlot[]
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  )
}

function OnboardingContent() {
  const { data: session, update: updateSession } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Read initial step from URL (for OAuth return)
  const initialStep = parseInt(searchParams.get('step') || '1')
  const [currentStep, setCurrentStep] = useState(initialStep >= 1 && initialStep <= 5 ? initialStep : 1)
  const [timezone, setTimezone] = useState('')
  const [timezoneAutoDetect, setTimezoneAutoDetect] = useState(true)
  const [username, setUsername] = useState('')
  const [copied, setCopied] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [editedSlots, setEditedSlots] = useState<Record<number, AvailabilitySlot[]>>({})
  const [availabilityChanged, setAvailabilityChanged] = useState(false)

  // Integration status
  const {
    googleCalendar,
    outlookCalendar,
    zoomConnected,
    isLoading: integrationsLoading,
    refetchCalendars,
    refetchZoom,
  } = useIntegrationStatus()

  // Handle OAuth callback params (calendar_connected, zoom_connected, etc.)
  useEffect(() => {
    const calendarConnected = searchParams.get('calendar_connected')
    const calendarError = searchParams.get('calendar_error')
    const zoomConnectedParam = searchParams.get('zoom_connected')
    const error = searchParams.get('error')

    if (calendarConnected === 'true') {
      toast({
        title: 'Calendar connected!',
        description: 'Your calendar has been successfully connected.',
      })
      refetchCalendars()
    } else if (calendarError) {
      toast({
        title: 'Connection failed',
        description: `Failed to connect calendar: ${calendarError}`,
        variant: 'destructive',
      })
    } else if (zoomConnectedParam === 'true') {
      toast({
        title: 'Zoom connected!',
        description: 'Your Zoom account has been successfully connected.',
      })
      refetchZoom()
    } else if (error) {
      toast({
        title: 'Connection failed',
        description: `Failed to connect: ${error}`,
        variant: 'destructive',
      })
    }

    // Clean up URL params
    if (calendarConnected || calendarError || zoomConnectedParam || error) {
      const step = searchParams.get('step')
      const cleanUrl = step ? `/dashboard/onboarding?step=${step}` : '/dashboard/onboarding'
      window.history.replaceState({}, '', cleanUrl)
    }
  }, [])

  // Fetch current user to check onboarding status
  const { data: userData, isLoading: isLoadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const res = await fetch('/api/users/me')
      if (!res.ok) throw new Error('Failed to fetch user')
      return res.json()
    },
    enabled: !!session?.user?.id,
  })

  // Redirect to dashboard if onboarding already completed
  useEffect(() => {
    if (userData?.user?.onboardingCompleted) {
      router.replace('/dashboard')
    }
  }, [userData, router])

  // Fetch event types
  const { data: eventTypesData } = useQuery({
    queryKey: ['eventTypes'],
    queryFn: async () => {
      const res = await fetch('/api/event-types')
      if (!res.ok) throw new Error('Failed to fetch event types')
      return res.json()
    },
    enabled: !!session?.user?.id,
  })

  const eventTypes: EventType[] = eventTypesData?.eventTypes || []

  // Fetch availability schedules
  const { data: schedulesData } = useQuery({
    queryKey: ['availability-schedules'],
    queryFn: async () => {
      const res = await fetch('/api/availability')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    enabled: !!session?.user?.id,
  })

  const schedules: Schedule[] = schedulesData?.schedules || []
  const defaultSchedule = schedules.find((s) => s.isDefault) || schedules[0]

  // Initialize availability slots from schedule
  useEffect(() => {
    if (defaultSchedule && Object.keys(editedSlots).length === 0) {
      const slotsByDay: Record<number, AvailabilitySlot[]> = {}
      DAYS.forEach((day) => {
        slotsByDay[day.value] = defaultSchedule.slots
          .filter((slot) => slot.dayOfWeek === day.value)
          .map((slot) => ({ ...slot }))
      })
      setEditedSlots(slotsByDay)
    }
  }, [defaultSchedule])

  // Initialize form data from session
  useEffect(() => {
    if (session?.user) {
      setTimezone(session.user.timezone || 'America/New_York')
      setTimezoneAutoDetect(session.user.timezoneAutoDetect ?? true)
      setUsername(session.user.username || '')
    }
  }, [session])

  // Auto-detect timezone when auto-detect is enabled
  useEffect(() => {
    if (timezoneAutoDetect) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (detected) {
        setTimezone(detected)
      }
    }
  }, [timezoneAutoDetect])

  // Check username availability
  useEffect(() => {
    const checkUsername = async () => {
      if (!username || username === session?.user?.username) {
        setUsernameAvailable(null)
        return
      }

      setCheckingUsername(true)
      try {
        const res = await fetch(`/api/users/check-username?username=${username}`)
        const data = await res.json()
        setUsernameAvailable(data.available)
      } catch {
        setUsernameAvailable(null)
      }
      setCheckingUsername(false)
    }

    const timer = setTimeout(checkUsername, 500)
    return () => clearTimeout(timer)
  }, [username, session?.user?.username])

  // Save user mutation
  const saveUserMutation = useMutation({
    mutationFn: async (data: { timezone?: string; timezoneAutoDetect?: boolean; username?: string; onboardingCompleted?: boolean }) => {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }
      return res.json()
    },
    onSuccess: (data) => {
      updateSession({ ...session, user: data.user })
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save',
        variant: 'destructive',
      })
    },
  })

  // Save availability mutation
  const saveAvailabilityMutation = useMutation({
    mutationFn: async (slots: AvailabilitySlot[]) => {
      if (!defaultSchedule) return
      const res = await fetch(`/api/availability/${defaultSchedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      })
      if (!res.ok) throw new Error('Failed to save')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-schedules'] })
      setAvailabilityChanged(false)
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to save availability.',
        variant: 'destructive',
      })
    },
  })

  // Availability functions
  const addSlot = (dayOfWeek: number) => {
    const daySlots = editedSlots[dayOfWeek] || []
    const lastSlot = daySlots[daySlots.length - 1]
    const newSlot: AvailabilitySlot = {
      dayOfWeek,
      startTime: lastSlot ? lastSlot.endTime : '09:00',
      endTime: lastSlot ? '17:00' : '17:00',
    }
    setEditedSlots({
      ...editedSlots,
      [dayOfWeek]: [...daySlots, newSlot],
    })
    setAvailabilityChanged(true)
  }

  const removeSlot = (dayOfWeek: number, index: number) => {
    const daySlots = [...(editedSlots[dayOfWeek] || [])]
    daySlots.splice(index, 1)
    setEditedSlots({
      ...editedSlots,
      [dayOfWeek]: daySlots,
    })
    setAvailabilityChanged(true)
  }

  const updateSlot = (
    dayOfWeek: number,
    index: number,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    const daySlots = [...(editedSlots[dayOfWeek] || [])]
    daySlots[index] = { ...daySlots[index], [field]: value }
    setEditedSlots({
      ...editedSlots,
      [dayOfWeek]: daySlots,
    })
    setAvailabilityChanged(true)
  }

  const toggleDay = (dayOfWeek: number) => {
    const daySlots = editedSlots[dayOfWeek] || []
    if (daySlots.length > 0) {
      setEditedSlots({ ...editedSlots, [dayOfWeek]: [] })
    } else {
      addSlot(dayOfWeek)
    }
    setAvailabilityChanged(true)
  }

  const handleNext = async () => {
    if (currentStep === 1) {
      // Save timezone
      await saveUserMutation.mutateAsync({ timezone, timezoneAutoDetect })
      setCurrentStep(2)
    } else if (currentStep === 2) {
      // Save availability if changed
      if (availabilityChanged) {
        const allSlots: AvailabilitySlot[] = []
        Object.entries(editedSlots).forEach(([dayOfWeek, slots]) => {
          slots.forEach((slot) => {
            allSlots.push({
              dayOfWeek: parseInt(dayOfWeek),
              startTime: slot.startTime,
              endTime: slot.endTime,
            })
          })
        })
        await saveAvailabilityMutation.mutateAsync(allSlots)
      }
      setCurrentStep(3)
    } else if (currentStep === 3) {
      // Check if username is valid before proceeding
      if (usernameAvailable === false) {
        toast({
          title: 'Username unavailable',
          description: 'Please choose a different username.',
          variant: 'destructive',
        })
        return
      }
      // Save username if changed
      if (username !== session?.user?.username) {
        await saveUserMutation.mutateAsync({ username })
      }
      setCurrentStep(4)
    } else if (currentStep === 4) {
      setCurrentStep(5)
    } else {
      // Complete onboarding - mark as completed and redirect
      await saveUserMutation.mutateAsync({ onboardingCompleted: true })
      router.push('/dashboard')
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = async () => {
    // Mark onboarding as completed even when skipping
    await saveUserMutation.mutateAsync({ onboardingCompleted: true })
    router.push('/dashboard')
  }

  const copyLink = () => {
    const link = `${window.location.origin}/${username}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    toast({ title: 'Link copied!' })
    setTimeout(() => setCopied(false), 2000)
  }

  const bookingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/${username}`
    : `/${username}`

  const isSaving = saveUserMutation.isPending || saveAvailabilityMutation.isPending

  const connectionsCount = [googleCalendar, outlookCalendar, zoomConnected].filter(Boolean).length

  // Show loading while checking onboarding status
  if (isLoadingUser || userData?.user?.onboardingCompleted) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ocean-100 text-ocean-700 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to TimeTide!
          </div>
          <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">
            Let&apos;s get you set up
          </h1>
          <p className="text-gray-600">
            Just a few quick steps to start scheduling meetings
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-1 mb-8">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isActive = currentStep === step.id
            const isCompleted = currentStep > step.id

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                    isActive
                      ? 'bg-ocean-500 text-white'
                      : isCompleted
                      ? 'bg-ocean-100 text-ocean-700'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs font-medium hidden sm:inline">{step.title}</span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-6 h-0.5 mx-0.5 ${
                      currentStep > step.id ? 'bg-ocean-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Step Content */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            {/* Step 1: Timezone */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
                    <Globe className="h-8 w-8 text-ocean-600" />
                  </div>
                  <h2 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                    Set Your Timezone
                  </h2>
                  <p className="text-gray-600">
                    This ensures your availability is displayed correctly to people booking with you.
                  </p>
                </div>
                <div className="space-y-4">
                  {/* Auto-detect checkbox */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timezoneAutoDetect}
                      onChange={(e) => {
                        const autoDetect = e.target.checked
                        setTimezoneAutoDetect(autoDetect)
                        if (autoDetect) {
                          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
                          if (detected) setTimezone(detected)
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-ocean-600 focus:ring-ocean-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Automatically detect timezone
                    </span>
                  </label>

                  {timezoneAutoDetect ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-ocean-50 border border-ocean-200 rounded-lg">
                      <Globe className="h-4 w-4 text-ocean-600" />
                      <span className="text-sm text-ocean-700 font-medium">
                        {timezone}
                      </span>
                      <span className="text-xs text-ocean-500">
                        ({TIMEZONES.find((tz) => tz.value === timezone)?.label || timezone})
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="timezone">Your Timezone</Label>
                      <select
                        id="timezone"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full h-12 rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        {TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    {timezoneAutoDetect
                      ? 'Your timezone was detected automatically. Uncheck to select manually.'
                      : 'Select your timezone from the list above.'}
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Availability */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-8 w-8 text-ocean-600" />
                  </div>
                  <h2 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                    Set Your Availability
                  </h2>
                  <p className="text-gray-600">
                    Choose when you&apos;re available for meetings. You can always change this later.
                  </p>
                </div>
                <div className="space-y-4">
                  {DAYS.map((day) => {
                    const daySlots = editedSlots[day.value] || []
                    const isActive = daySlots.length > 0

                    return (
                      <div key={day.value} className="flex items-start gap-3">
                        {/* Day toggle */}
                        <div className="w-24 flex-shrink-0 pt-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleDay(day.value)}
                              className={cn(
                                'w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                                isActive
                                  ? 'bg-ocean-500 border-ocean-500 text-white'
                                  : 'border-gray-300 hover:border-ocean-500'
                              )}
                            >
                              {isActive && <Check className="h-3 w-3" />}
                            </button>
                            <span
                              className={cn(
                                'text-sm font-medium',
                                isActive ? 'text-gray-900' : 'text-gray-400'
                              )}
                            >
                              {day.short}
                            </span>
                          </div>
                        </div>

                        {/* Time slots */}
                        <div className="flex-1">
                          {!isActive ? (
                            <p className="text-gray-400 text-sm pt-2">Unavailable</p>
                          ) : (
                            <div className="space-y-2">
                              {daySlots.map((slot, index) => (
                                <div key={index} className="flex items-center gap-2">
                                  <select
                                    value={slot.startTime}
                                    onChange={(e) =>
                                      updateSlot(day.value, index, 'startTime', e.target.value)
                                    }
                                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                                  >
                                    {TIME_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="text-gray-400">-</span>
                                  <select
                                    value={slot.endTime}
                                    onChange={(e) =>
                                      updateSlot(day.value, index, 'endTime', e.target.value)
                                    }
                                    className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                                  >
                                    {TIME_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => removeSlot(day.value, index)}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => addSlot(day.value)}
                                className="flex items-center gap-1 text-xs text-ocean-600 hover:text-ocean-700"
                              >
                                <Plus className="h-3 w-3" />
                                Add time
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Booking Link */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
                    <LinkIcon className="h-8 w-8 text-ocean-600" />
                  </div>
                  <h2 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                    Your Booking Link
                  </h2>
                  <p className="text-gray-600">
                    Customize your unique booking URL that you&apos;ll share with others.
                  </p>
                </div>
                <div className="space-y-4">
                  {/* Username Input */}
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                        {typeof window !== 'undefined' ? window.location.host : 'timetide.app'}/
                      </span>
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) =>
                          setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                        }
                        className="pl-32"
                        placeholder="username"
                      />
                      {checkingUsername && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                      )}
                      {!checkingUsername && usernameAvailable === true && (
                        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                      {!checkingUsername && usernameAvailable === false && (
                        <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                      )}
                    </div>
                    {usernameAvailable === false && (
                      <p className="text-sm text-red-500">This username is already taken</p>
                    )}
                  </div>

                  {/* Preview & Copy */}
                  <div className="p-4 bg-gray-50 rounded-lg border">
                    <p className="text-sm text-gray-500 mb-2">Your booking link:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono truncate">
                        {bookingUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={copyLink}
                        className="flex-shrink-0"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Link href={bookingUrl} target="_blank">
                        <Button variant="outline" size="icon" className="flex-shrink-0">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Event Types */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
                    <Calendar className="h-8 w-8 text-ocean-600" />
                  </div>
                  <h2 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                    Your Event Types
                  </h2>
                  <p className="text-gray-600">
                    We&apos;ve created a default meeting type for you. You can customize it or create more.
                  </p>
                </div>
                <div className="space-y-3">
                  {eventTypes.length > 0 ? (
                    eventTypes.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:border-ocean-300 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-ocean-100 flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-ocean-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{event.title}</p>
                            <p className="text-sm text-gray-500">{event.length} minutes</p>
                          </div>
                        </div>
                        <Link href={`/dashboard/event-types/${event.id}/edit`}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </Link>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>No event types yet</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-center pt-2">
                  <Link href="/dashboard/event-types/new">
                    <Button variant="outline">
                      Create New Event Type
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Step 5: Connect Accounts */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-ocean-100 flex items-center justify-center mx-auto mb-4">
                    <Zap className="h-8 w-8 text-ocean-600" />
                  </div>
                  <h2 className="text-xl font-heading font-semibold text-gray-900 mb-2">
                    Connect Your Accounts
                  </h2>
                  <p className="text-gray-600">
                    Connect your calendar and video conferencing accounts to auto-generate meeting links and prevent double-bookings.
                  </p>
                </div>

                <div className="space-y-3">
                  <IntegrationConnectCard
                    provider="GOOGLE"
                    connected={!!googleCalendar}
                    name={googleCalendar?.name}
                    returnTo="/dashboard/onboarding?step=5"
                  />
                  <IntegrationConnectCard
                    provider="OUTLOOK"
                    connected={!!outlookCalendar}
                    name={outlookCalendar?.name}
                    returnTo="/dashboard/onboarding?step=5"
                  />
                  <IntegrationConnectCard
                    provider="ZOOM"
                    connected={zoomConnected}
                    returnTo="/dashboard/onboarding?step=5"
                  />
                </div>

                {connectionsCount > 0 && (
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-sm text-green-800">
                      {connectionsCount} integration{connectionsCount > 1 ? 's' : ''} connected. Meeting links will be auto-generated when you create bookings.
                    </p>
                  </div>
                )}

                {connectionsCount === 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-sm text-amber-800">
                      You can skip this step and connect accounts later from Settings. Without integrations, meeting links won&apos;t be auto-generated.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          <div>
            {currentStep > 1 ? (
              <Button variant="ghost" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={handleSkip}>
                Skip for now
              </Button>
            )}
          </div>
          <Button onClick={handleNext} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : currentStep === 5 ? (
              <>
                Go to Dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
