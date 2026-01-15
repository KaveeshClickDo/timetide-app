'use client'

import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, Clock, Users, Calendar, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  }
}

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const res = await fetch('/api/analytics')
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json()
    },
  })

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
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-gray-900 mb-2">Analytics</h1>
        <p className="text-gray-600">Track your booking performance and trends.</p>
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

        {/* Popular Event Types */}
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

        {/* Booking Times */}
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

        {/* Booking Status Distribution */}
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
      </div>
    </div>
  )
}
