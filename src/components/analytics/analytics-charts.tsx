'use client'

import { BarChart3, TrendingUp, Clock, Users, Calendar } from 'lucide-react'
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
import ChartEmptyState from './chart-empty-state'
import type { AnalyticsData } from '@/types/analytics'

const TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
}

interface ChartProps {
  hasBookings: boolean
  charts: AnalyticsData['charts'] | undefined
  stats?: AnalyticsData['stats'] | undefined
}

export function BookingsOverTimeChart({ hasBookings, charts }: ChartProps) {
  return (
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="bookings" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmptyState icon={BarChart3} message="Charts will appear once you have bookings" />
        )}
      </CardContent>
    </Card>
  )
}

export function PopularEventTypesChart({ hasBookings, charts }: ChartProps) {
  return (
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmptyState icon={BarChart3} message="Create event types and get bookings to see insights" />
        )}
      </CardContent>
    </Card>
  )
}

export function BookingTimesChart({ hasBookings, charts }: ChartProps) {
  return (
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="bookings" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmptyState icon={Clock} message="See peak booking hours once you have data" />
        )}
      </CardContent>
    </Card>
  )
}

export function StatusDistributionChart({ hasBookings, charts, stats }: ChartProps) {
  return (
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmptyState icon={TrendingUp} message="Track your completion rate over time" />
        )}
      </CardContent>
    </Card>
  )
}

export function LeadTimeChart({ hasBookings, charts }: ChartProps) {
  return (
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
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="bookings" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmptyState icon={Calendar} message="See how far ahead people book" />
        )}
      </CardContent>
    </Card>
  )
}

export function DayOfWeekChart({ hasBookings, charts }: ChartProps) {
  return (
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
                  contentStyle={TOOLTIP_STYLE}
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
          <ChartEmptyState icon={Calendar} message="See your busiest days of the week" />
        )}
      </CardContent>
    </Card>
  )
}

export function RepeatGuestsChart({ hasBookings, charts }: ChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Repeat Guests</CardTitle>
        <CardDescription>Guest loyalty and return bookings</CardDescription>
      </CardHeader>
      <CardContent>
        {hasBookings && charts?.repeatGuests && charts.repeatGuests.length > 0 ? (
          <div className="space-y-6">
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
                    {charts.repeatGuests.map((entry: { color: string }, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {charts.topRepeatGuests && charts.topRepeatGuests.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Top Returning Guests</p>
                <div className="space-y-2">
                  {charts.topRepeatGuests.map((guest, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{guest.name}</p>
                        <p className="text-xs text-gray-500 truncate">{guest.email}</p>
                      </div>
                      <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-ocean-100 text-ocean-700">
                        {guest.bookings} bookings
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <ChartEmptyState icon={Users} message="See how many guests return for more bookings" />
        )}
      </CardContent>
    </Card>
  )
}
