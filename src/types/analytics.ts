// Centralized analytics types

export interface AnalyticsData {
  stats: {
    totalBookings: number
    thisMonthBookings: number
    totalHours: number
    uniqueGuests: number
    cancellationRate: number
  }
  charts: {
    bookingsOverTime: Array<{ date: string; label: string; bookings: number }>
    popularEventTypes: Array<{ title: string; count: number }>
    bookingTimes: Array<{ hour: number; label: string; bookings: number }>
    statusDistribution: Array<{ status: string; count: number; color: string }>
    leadTime: Array<{ label: string; bookings: number }>
    dayOfWeek: Array<{ day: string; label: string; bookings: number }>
    repeatGuests: Array<{ label: string; guests: number; color: string }>
    topRepeatGuests: Array<{ name: string; email: string; bookings: number }>
  }
}

export type ChartKey = 'bookingsOverTime' | 'popularEventTypes' | 'bookingTimes' | 'statusDistribution' | 'leadTime' | 'dayOfWeek' | 'repeatGuests'

export interface ChartConfig {
  key: ChartKey
  title: string
  description: string
}
