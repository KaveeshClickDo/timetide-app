'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/admin/page-header'
import { cn } from '@/lib/utils'
import type { PlatformAnalytics } from '@/types'

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']
const PLAN_COLORS: Record<string, string> = { FREE: '#94a3b8', PRO: '#6366f1', TEAM: '#8b5cf6' }

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery<PlatformAnalytics>({
    queryKey: ['admin-analytics', days],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics?days=${days}`)
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json()
    },
  })

  return (
    <div>
      <PageHeader
        title="Platform Analytics"
        description="Platform-wide metrics and trends"
        actions={
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[7, 30, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? 'default' : 'ghost'}
                className={cn('h-7 text-xs', days === d && 'bg-indigo-600')}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <p className="text-center py-20 text-gray-500">Loading analytics...</p>
      ) : !data ? (
        <p className="text-center py-20 text-gray-500">No data available</p>
      ) : (
        <div className="space-y-6">
          {/* Signup & Booking Trends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Signup Trends</CardTitle>
                <CardDescription>New user registrations over time</CardDescription>
              </CardHeader>
              <CardContent>
                {data.signupTrends.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No signups in this period</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.signupTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString()} />
                        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Signups" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Booking Trends</CardTitle>
                <CardDescription>Bookings created over time</CardDescription>
              </CardHeader>
              <CardContent>
                {data.bookingTrends.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No bookings in this period</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.bookingTrends}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString()} />
                        <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Bookings" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Plan Distribution & Calendar Providers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Plan Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {data.planDistribution.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No data</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.planDistribution}
                          dataKey="count"
                          nameKey="plan"
                          cx="50%" cy="50%"
                          outerRadius={80}
                          label={({ name, value }: { name?: string; value?: number }) => `${name}: ${value}`}
                        >
                          {data.planDistribution.map((entry) => (
                            <Cell key={entry.plan} fill={PLAN_COLORS[entry.plan] || COLORS[0]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Calendar Providers</CardTitle>
              </CardHeader>
              <CardContent>
                {data.calendarProviders.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No calendars connected</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.calendarProviders}
                          dataKey="count"
                          nameKey="provider"
                          cx="50%" cy="50%"
                          outerRadius={80}
                          label={({ name, value }: { name?: string; value?: number }) => `${name}: ${value}`}
                        >
                          {data.calendarProviders.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Event Types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Event Types</CardTitle>
              <CardDescription>Most booked event types across the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {data.topEventTypes.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No event types</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.topEventTypes} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="title" tick={{ fontSize: 11 }} width={150} />
                      <Tooltip formatter={(value, name, props) => [value, `Host: ${props.payload.host}`]} />
                      <Bar dataKey="bookings" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
