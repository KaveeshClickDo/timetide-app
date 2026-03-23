'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Settings2, EyeOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useFeatureGate } from '@/hooks/use-feature-gate'
import { FeatureGatePage } from '@/components/billing/feature-gate-page'
import StatsOverview from '@/components/analytics/stats-overview'
import {
  BookingsOverTimeChart,
  PopularEventTypesChart,
  BookingTimesChart,
  StatusDistributionChart,
  LeadTimeChart,
  DayOfWeekChart,
  RepeatGuestsChart,
} from '@/components/analytics/analytics-charts'
import type { AnalyticsData, ChartKey, ChartConfig } from '@/types/analytics'

const CHART_CONFIGS: ChartConfig[] = [
  { key: 'bookingsOverTime', title: 'Bookings Over Time', description: 'Your booking trends over the past 30 days' },
  { key: 'popularEventTypes', title: 'Popular Event Types', description: 'Your most booked event types' },
  { key: 'bookingTimes', title: 'Booking Times', description: 'When people book meetings with you' },
  { key: 'statusDistribution', title: 'Booking Status', description: 'Booking completion vs cancellations' },
  { key: 'leadTime', title: 'Booking Lead Time', description: 'How far in advance people book' },
  { key: 'dayOfWeek', title: 'Day of Week', description: 'Which days are most popular for bookings' },
  { key: 'repeatGuests', title: 'Repeat Guests', description: 'Guest loyalty and return bookings' },
]

const DEFAULT_VISIBLE_CHARTS: ChartKey[] = ['bookingsOverTime', 'popularEventTypes', 'bookingTimes', 'statusDistribution', 'leadTime', 'dayOfWeek', 'repeatGuests']

const STORAGE_KEY = 'analytics-visible-charts'

const CHART_COMPONENTS: Record<ChartKey, React.ComponentType<{ hasBookings: boolean; charts: AnalyticsData['charts'] | undefined; stats?: AnalyticsData['stats'] | undefined }>> = {
  bookingsOverTime: BookingsOverTimeChart,
  popularEventTypes: PopularEventTypesChart,
  bookingTimes: BookingTimesChart,
  statusDistribution: StatusDistributionChart,
  leadTime: LeadTimeChart,
  dayOfWeek: DayOfWeekChart,
  repeatGuests: RepeatGuestsChart,
}

export default function AnalyticsPage() {
  const [visibleCharts, setVisibleCharts] = useState<ChartKey[]>(DEFAULT_VISIBLE_CHARTS)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setVisibleCharts(parsed)
        }
      } catch {
        // Invalid stored data, use defaults
      }
    }
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleCharts))
    }
  }, [visibleCharts, isHydrated])

  const toggleChart = (chartKey: ChartKey) => {
    setVisibleCharts((prev) =>
      prev.includes(chartKey)
        ? prev.filter((key) => key !== chartKey)
        : [...prev, chartKey]
    )
  }

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const res = await fetch('/api/analytics')
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json()
    },
  })

  const analyticsGate = useFeatureGate('analytics');

  if (analyticsGate.requiresUpgrade) {
    return (
      <FeatureGatePage
        feature="analytics"
        requiredPlan={analyticsGate.requiredPlan}
        description="View booking trends, popular event types, peak hours, and guest insights. Available on the Team plan."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">Analytics</h1>
          <p className="text-gray-600">Track your booking performance and trends.</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-ocean-600" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">Analytics</h1>
          <p className="text-gray-600">Track your booking performance and trends.</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-600">Failed to load analytics data</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const stats = data?.stats
  const charts = data?.charts
  const hasBookings = stats != null && stats.totalBookings > 0

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold text-gray-900 mb-2">Analytics</h1>
          <p className="text-sm sm:text-base text-gray-600">Track your booking performance and trends.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Customize Charts
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Show/Hide Charts</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CHART_CONFIGS.map((config) => (
              <DropdownMenuCheckboxItem
                key={config.key}
                checked={visibleCharts.includes(config.key)}
                onCheckedChange={() => toggleChart(config.key)}
              >
                {config.title}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <StatsOverview stats={stats} />

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {CHART_CONFIGS.map(({ key }) => {
          if (!visibleCharts.includes(key)) return null
          const ChartComponent = CHART_COMPONENTS[key]
          return <ChartComponent key={key} hasBookings={hasBookings} charts={charts} stats={stats} />
        })}
      </div>

      {/* Empty state when no charts selected */}
      {visibleCharts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <EyeOff className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No charts selected</p>
            <p className="text-sm text-gray-400 mb-4">
              Use the &quot;Customize Charts&quot; button to select which charts to display
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleCharts(DEFAULT_VISIBLE_CHARTS)}
            >
              Show All Charts
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
