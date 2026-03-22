'use client'

import { format } from 'date-fns'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimeSlot } from '@/types/booking'

interface BookingTimeSlotsProps {
  selectedDate: Date
  availableSlots: TimeSlot[]
  selectedSlot: string | null
  seatsPerSlot?: number
  onSlotSelect: (slot: string) => void
  onBack: () => void
}

export default function BookingTimeSlots({
  selectedDate,
  availableSlots,
  selectedSlot,
  seatsPerSlot,
  onSlotSelect,
  onBack,
}: BookingTimeSlotsProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
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
              onClick={() => onSlotSelect(slot.time)}
              className={cn(
                'time-slot',
                selectedSlot === slot.time && 'time-slot-selected'
              )}
            >
              <span>{slot.formattedTime}</span>
              {slot.seatsRemaining != null && slot.seatsRemaining < (seatsPerSlot ?? 1) && (
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
  )
}
