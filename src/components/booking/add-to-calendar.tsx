'use client'

import { useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AddToCalendarProps {
  bookingUid: string
  variant?: 'default' | 'outline' | 'ghost'
  className?: string
}

const calendarProviders = [
  { name: 'Google Calendar', value: 'google', icon: '📅' },
  { name: 'Outlook', value: 'outlook', icon: '📧' },
  { name: 'Office 365', value: 'office365', icon: '🏢' },
  { name: 'Yahoo Calendar', value: 'yahoo', icon: '📮' },
  { name: 'Apple Calendar', value: 'apple', icon: '🍎' },
  { name: 'Download .ics', value: 'ics', icon: '📥' },
]

export function AddToCalendar({ bookingUid, variant = 'outline', className }: AddToCalendarProps) {
  const handleAddToCalendar = (provider: string) => {
    const url = `/api/bookings/${bookingUid}/calendar?provider=${provider}`
    window.open(url, '_blank')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} className={className}>
          <Calendar className="h-4 w-4 mr-2" />
          Add to Calendar
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {calendarProviders.map((provider) => (
          <DropdownMenuItem
            key={provider.value}
            onClick={() => handleAddToCalendar(provider.value)}
            className="cursor-pointer"
          >
            <span className="mr-2">{provider.icon}</span>
            {provider.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
