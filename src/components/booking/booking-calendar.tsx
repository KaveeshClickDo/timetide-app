'use client'

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
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BookingWindow } from '@/types/booking'

interface BookingCalendarProps {
  currentMonth: Date
  setCurrentMonth: (date: Date) => void
  selectedDate: Date | null
  slotsLoading: boolean
  slotsError: Error | null
  dateHasSlots: (date: Date) => boolean
  bookingWindow: BookingWindow | null
  onDateSelect: (date: Date) => void
}

export default function BookingCalendar({
  currentMonth,
  setCurrentMonth,
  selectedDate,
  slotsLoading,
  slotsError,
  dateHasSlots,
  bookingWindow,
  onDateSelect,
}: BookingCalendarProps) {
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const firstDayOfMonth = startOfMonth(currentMonth).getDay()
  const today = startOfDay(new Date())

  const isMonthInBookingWindow = (monthDate: Date): boolean => {
    if (!bookingWindow) return true

    const monthEnd = endOfMonth(monthDate)
    const windowStart = new Date(bookingWindow.start)

    if (monthEnd < windowStart) return false

    if (bookingWindow.end) {
      const windowEnd = new Date(bookingWindow.end)
      const monthStart = startOfMonth(monthDate)
      if (monthStart > windowEnd) return false
    }

    return true
  }

  const canGoPrevMonth = (): boolean => {
    const prevMonth = addDays(startOfMonth(currentMonth), -1)
    if (endOfMonth(prevMonth) < today) return false
    return isMonthInBookingWindow(prevMonth)
  }

  const canGoNextMonth = (): boolean => {
    const nextMonth = addDays(endOfMonth(currentMonth), 1)
    return isMonthInBookingWindow(nextMonth)
  }

  return (
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
                onClick={() => onDateSelect(day)}
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
  )
}
