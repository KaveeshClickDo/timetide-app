'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, Clock, Users, Calendar, Loader2, Settings2, Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { useFeatureGate } from '@/hooks/use-feature-gate'
import { FeatureGatePage } from '@/components/feature-gate-page'

interface AnalyticsData {
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
  }
}

type ChartKey = 'bookingsOverTime' | 'popularEventTypes' | 'bookingTimes' | 'statusDistribution' | 'leadTime' | 'dayOfWeek' | 'repeatGuests'

interface ChartConfig {
  key: ChartKey
  title: string
  description: string
}

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

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

export default function AnalyticsPage() {
  const [visibleCharts, setVisibleCharts] = useState<ChartKey[]>(DEFAULT_VISIBLE_CHARTS)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load preferences from localStorage on mount
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

  // Save preferences to localStorage when changed
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

  const isChartVisible = (chartKey: ChartKey) => visibleCharts.includes(chartKey)

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

  const hasBookings = stats && stats.totalBookings > 0

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">Analytics</h1>
          <p className="text-gray-600">Track your booking performance and trends.</p>
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
                checked={isChartVisible(config.key)}
                onCheckedChange={() => toggleChart(config.key)}
              >
                {config.title}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats Overview */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-ocean-100 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-ocean-600" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-gray-900">
                  {stats?.totalBookings ?? 0}
                </p>
                <p className="text-sm text-gray-500">Total Bookings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-gray-900">
                  {stats?.thisMonthBookings ?? 0}
                </p>
                <p className="text-sm text-gray-500">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-gray-900">
                  {stats?.totalHours ?? 0}h
                </p>
                <p className="text-sm text-gray-500">Hours Booked</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-heading font-bold text-gray-900">
                  {stats?.uniqueGuests ?? 0}
                </p>
                <p className="text-sm text-gray-500">Unique Guests</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Bookings Over Time */}
        {isChartVisible('bookingsOverTime') && (
          <Card>
            <CardHeader>
              <CardTitle>Bookings Over Time</CardTitle>
              <CardDescription>Your booking trends over the past 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {hasBookings && charts?.bookingsOverTime ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.bookingsOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                        interval="preserveStartEnd"
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="bookings" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data yet</p>
                    <p className="text-sm text-gray-400">
                      Charts will appear once you have bookings
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Popular Event Types */}
        {isChartVisible('popularEventTypes') && (
          <Card>
            <CardHeader>
              <CardTitle>Popular Event Types</CardTitle>
              <CardDescription>Your most booked event types</CardDescription>
            </CardHeader>
            <CardContent>
              {hasBookings && charts?.popularEventTypes && charts.popularEventTypes.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.popularEventTypes} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="title"
                        tick={{ fontSize: 11 }}
                        width={120}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data yet</p>
                    <p className="text-sm text-gray-400">
                      Create event types and get bookings to see insights
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Booking Times */}
        {isChartVisible('bookingTimes') && (
          <Card>
            <CardHeader>
              <CardTitle>Booking Times</CardTitle>
              <CardDescription>When people book meetings with you</CardDescription>
            </CardHeader>
            <CardContent>
              {hasBookings && charts?.bookingTimes ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.bookingTimes.filter((t) => t.bookings > 0)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="bookings" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data yet</p>
                    <p className="text-sm text-gray-400">See peak booking hours once you have data</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Booking Status Distribution */}
        {isChartVisible('statusDistribution') && (
          <Card>
            <CardHeader>
              <CardTitle>Booking Status</CardTitle>
              <CardDescription>
                {hasBookings
                  ? `${stats?.cancellationRate ?? 0}% cancellation rate`
                  : 'Booking completion vs cancellations'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasBookings && charts?.statusDistribution && charts.statusDistribution.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts.statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="status"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {charts.statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data yet</p>
                    <p className="text-sm text-gray-400">Track your completion rate over time</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Booking Lead Time */}
        {isChartVisible('leadTime') && (
          <Card>
            <CardHeader>
              <CardTitle>Booking Lead Time</CardTitle>
              <CardDescription>How far in advance people book</CardDescription>
            </CardHeader>
            <CardContent>
              {hasBookings && charts?.leadTime ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.leadTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="bookings" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data yet</p>
                    <p className="text-sm text-gray-400">See how far ahead people book</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Day of Week */}
        {isChartVisible('dayOfWeek') && (
          <Card>
            <CardHeader>
              <CardTitle>Day of Week</CardTitle>
              <CardDescription>Which days are most popular for bookings</CardDescription>
            </CardHeader>
            <CardContent>
              {hasBookings && charts?.dayOfWeek ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.dayOfWeek}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                        labelFormatter={(label) => {
                          const dayData = charts.dayOfWeek.find((d) => d.label === label)
                          return dayData?.day || label
                        }}
                      />
                      <Bar dataKey="bookings" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data yet</p>
                    <p className="text-sm text-gray-400">See your busiest days of the week</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Repeat Guests */}
        {isChartVisible('repeatGuests') && (
          <Card>
            <CardHeader>
              <CardTitle>Repeat Guests</CardTitle>
              <CardDescription>Guest loyalty and return bookings</CardDescription>
            </CardHeader>
            <CardContent>
              {hasBookings && charts?.repeatGuests && charts.repeatGuests.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts.repeatGuests}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="guests"
                        nameKey="label"
                        label={({ name, value }) => `${name}: ${value}`}
                        labelLine={false}
                      >
                        {charts.repeatGuests.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No data yet</p>
                    <p className="text-sm text-gray-400">See how many guests return for more bookings</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Empty state when no charts selected */}
      {visibleCharts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <EyeOff className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No charts selected</p>
            <p className="text-sm text-gray-400 mb-4">
              Use the "Customize Charts" button to select which charts to display
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
