'use client'

import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'

export function useIntegrationStatus() {
  const { data: session } = useSession()

  const { data: calendarsData, isLoading: loadingCalendars, refetch: refetchCalendars } = useQuery({
    queryKey: ['calendars'],
    queryFn: async () => {
      const res = await fetch('/api/calendars')
      if (!res.ok) throw new Error('Failed to fetch calendars')
      return res.json()
    },
    enabled: !!session?.user?.id,
    refetchOnWindowFocus: true,
  })

  const { data: zoomData, isLoading: loadingZoom, refetch: refetchZoom } = useQuery({
    queryKey: ['zoom-status'],
    queryFn: async () => {
      const res = await fetch('/api/zoom/status')
      if (!res.ok) return { connected: false }
      return res.json()
    },
    enabled: !!session?.user?.id,
    refetchOnWindowFocus: true,
  })

  const calendars = calendarsData?.calendars || []

  return {
    googleCalendar: calendars.find((cal: any) => cal.provider === 'GOOGLE') || null,
    outlookCalendar: calendars.find((cal: any) => cal.provider === 'OUTLOOK') || null,
    zoomConnected: zoomData?.connected || false,
    isLoading: loadingCalendars || loadingZoom,
    refetchCalendars,
    refetchZoom,
  }
}
