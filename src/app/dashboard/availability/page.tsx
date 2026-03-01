'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Plus,
  Trash2,
  Save,
  Loader2,
  Copy,
  MoreVertical,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

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

export default function AvailabilityPage() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null)
  const [editedSlots, setEditedSlots] = useState<Record<number, AvailabilitySlot[]>>({})
  const [hasChanges, setHasChanges] = useState(false)

  const { data: schedules, isLoading } = useQuery<Schedule[], Error>({
    queryKey: ['availability-schedules'],
    queryFn: async () => {
      const res = await fetch('/api/availability')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      return Array.isArray(data.schedules) ? data.schedules : []
    },
  })

  useEffect(() => {
    if (schedules && schedules.length > 0 && !selectedSchedule) {
      const defaultSchedule = schedules.find((s) => s.isDefault) || schedules[0]
      setSelectedSchedule(defaultSchedule.id)
      initializeSlots(defaultSchedule)
    }
  }, [schedules])

  const saveMutation = useMutation({
    mutationFn: async (slots: AvailabilitySlot[]) => {
      const res = await fetch(`/api/availability/${selectedSchedule}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      })
      if (!res.ok) throw new Error('Failed to save')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-schedules'] })
      setHasChanges(false)
      toast({ title: 'Availability saved', description: 'Your availability has been updated.' })
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save availability.', variant: 'destructive' })
    },
  })

  const initializeSlots = (schedule: Schedule) => {
    const slotsByDay: Record<number, AvailabilitySlot[]> = {}
    DAYS.forEach((day) => {
      slotsByDay[day.value] = schedule.slots
        .filter((slot) => slot.dayOfWeek === day.value)
        .map((slot) => ({ ...slot }))
    })
    setEditedSlots(slotsByDay)
  }

  const handleScheduleChange = (scheduleId: string) => {
    const schedule = schedules?.find((s) => s.id === scheduleId)
    if (schedule) {
      setSelectedSchedule(scheduleId)
      initializeSlots(schedule)
      setHasChanges(false)
    }
  }

  const addSlot = (dayOfWeek: number) => {
    const daySlots = editedSlots[dayOfWeek] || []
    const lastSlot = daySlots[daySlots.length - 1]
    const newSlot: AvailabilitySlot = {
      dayOfWeek,
      startTime: lastSlot ? lastSlot.endTime : '09:00',
      endTime: '17:00',
    }
    setEditedSlots({ ...editedSlots, [dayOfWeek]: [...daySlots, newSlot] })
    setHasChanges(true)
  }

  const removeSlot = (dayOfWeek: number, index: number) => {
    const daySlots = [...(editedSlots[dayOfWeek] || [])]
    daySlots.splice(index, 1)
    setEditedSlots({ ...editedSlots, [dayOfWeek]: daySlots })
    setHasChanges(true)
  }

  const updateSlot = (
    dayOfWeek: number,
    index: number,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    const daySlots = [...(editedSlots[dayOfWeek] || [])]
    daySlots[index] = { ...daySlots[index], [field]: value }
    setEditedSlots({ ...editedSlots, [dayOfWeek]: daySlots })
    setHasChanges(true)
  }

  const copyToAllDays = (sourceDayOfWeek: number) => {
    const sourceSlots = editedSlots[sourceDayOfWeek] || []
    const newSlots: Record<number, AvailabilitySlot[]> = {}
    DAYS.forEach((day) => {
      newSlots[day.value] = sourceSlots.map((slot) => ({
        ...slot,
        dayOfWeek: day.value,
        id: undefined,
      }))
    })
    setEditedSlots(newSlots)
    setHasChanges(true)
    toast({ title: 'Copied to all days' })
  }

  const handleSave = () => {
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
    saveMutation.mutate(allSlots)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-ocean-500" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-2">
            Availability
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Set when you&apos;re available for bookings.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="w-full sm:w-auto flex-shrink-0"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      {/* Schedule selector */}
      {schedules && schedules.length > 1 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {schedules.map((schedule) => (
            <Button
              key={schedule.id}
              variant={selectedSchedule === schedule.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleScheduleChange(schedule.id)}
            >
              {schedule.name}
              {schedule.isDefault && <span className="ml-2 text-xs opacity-70">(Default)</span>}
            </Button>
          ))}
        </div>
      )}

      {/* Availability grid */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-4 sm:space-y-6">
            {DAYS.map((day) => {
              const daySlots = editedSlots[day.value] || []
              const isActive = daySlots.length > 0

              return (
                <div key={day.value} className="flex flex-wrap items-start gap-2">
                  {/* Day label */}
                  <div className="w-14 sm:w-28 flex-shrink-0 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          isActive
                            ? setEditedSlots({ ...editedSlots, [day.value]: [] })
                            : addSlot(day.value)
                        }
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
                          'font-medium text-sm sm:text-base',
                          isActive ? 'text-gray-900' : 'text-gray-400'
                        )}
                      >
                        {/* Short name on mobile, full name on desktop */}
                        <span className="sm:hidden">{day.short}</span>
                        <span className="hidden sm:inline">{day.label}</span>
                      </span>
                    </div>
                  </div>

                  {/* Time slots */}
                  <div className="flex-1 min-w-0">
                    {!isActive ? (
                      <p className="text-gray-400 text-sm pt-2">Unavailable</p>
                    ) : (
                      <div className="space-y-2">
                        {daySlots.map((slot, index) => (
                          <div key={index} className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                            {/* Mobile: fluid selects — Desktop: fixed-width selects */}
                            <select
                              value={slot.startTime}
                              onChange={(e) =>
                                updateSlot(day.value, index, 'startTime', e.target.value)
                              }
                              className="flex-1 sm:flex-none sm:w-[120px] min-w-0 h-9 sm:h-10 rounded-lg border border-input bg-background px-1 sm:px-2 text-sm"
                            >
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <span className="text-gray-400 flex-shrink-0">–</span>
                            <select
                              value={slot.endTime}
                              onChange={(e) =>
                                updateSlot(day.value, index, 'endTime', e.target.value)
                              }
                              className="flex-1 sm:flex-none sm:w-[120px] min-w-0 h-9 sm:h-10 rounded-lg border border-input bg-background px-1 sm:px-2 text-sm"
                            >
                              {TIME_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => removeSlot(day.value, index)}
                              className="flex-shrink-0 p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => addSlot(day.value)}
                            className="flex items-center gap-1 text-xs sm:text-sm text-ocean-600 hover:text-ocean-700"
                          >
                            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                            Add time
                          </button>
                          {/* Copy to all — inline on mobile only */}
                          <button
                            onClick={() => copyToAllDays(day.value)}
                            className="sm:hidden flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="h-3 w-3" />
                            Copy to all
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Desktop actions dropdown */}
                  <div className="hidden sm:block flex-shrink-0 ml-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 hover:bg-gray-100 rounded-lg">
                          <MoreVertical className="h-4 w-4 text-gray-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyToAllDays(day.value)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy to all days
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Timezone info */}
      <div className="mt-6 flex items-start gap-2 text-sm text-gray-500">
        <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <span>
          Times are shown in{' '}
          <span className="font-medium text-gray-700">{session?.user?.timezone || 'UTC'}</span>
          {session?.user?.timezoneAutoDetect ? ' (auto-detected)' : ''}. Change your timezone in{' '}
          <a href="/dashboard/settings" className="text-ocean-600 hover:underline">
            Settings
          </a>
          .
        </span>
      </div>
    </div>
  )
}
