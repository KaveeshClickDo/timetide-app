'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Users, Calendar, UsersRound, Ticket, UserPlus, TrendingUp, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatCard } from '@/components/admin/stat-card'
import { PageHeader } from '@/components/admin/page-header'
import { cn, getInitials } from '@/lib/utils'
import type { AdminStats } from '@/types'

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-gray-100 text-gray-700',
}

const planColors: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-600',
  PRO: 'bg-indigo-100 text-indigo-700',
  TEAM: 'bg-purple-100 text-purple-700',
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats')
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
  })

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        description="Overview of your TimeTide platform"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatCard
          title="Total Users"
          value={isLoading ? '...' : stats?.totalUsers ?? 0}
          icon={Users}
          description={stats ? `+${stats.newSignupsToday} today` : undefined}
        />
        <StatCard
          title="Total Bookings"
          value={isLoading ? '...' : stats?.totalBookings ?? 0}
          icon={Calendar}
          description={stats ? `${stats.bookingsToday} today` : undefined}
        />
        <StatCard
          title="Active Teams"
          value={isLoading ? '...' : stats?.activeTeams ?? 0}
          icon={UsersRound}
        />
        <StatCard
          title="Open Tickets"
          value={isLoading ? '...' : stats?.openTickets ?? 0}
          icon={Ticket}
        />
      </div>

      {/* Signups breakdown */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
        <StatCard
          title="Signups Today"
          value={isLoading ? '...' : stats?.newSignupsToday ?? 0}
          icon={UserPlus}
        />
        <StatCard
          title="Signups This Week"
          value={isLoading ? '...' : stats?.newSignupsWeek ?? 0}
          icon={TrendingUp}
        />
        <StatCard
          title="Signups This Month"
          value={isLoading ? '...' : stats?.newSignupsMonth ?? 0}
          icon={Clock}
        />
      </div>

      {/* Plan Distribution */}
      {stats?.planDistribution && stats.planDistribution.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Plan Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {stats.planDistribution.map((item) => (
                <div key={item.plan} className="flex items-center gap-2">
                  <Badge className={cn('text-xs', planColors[item.plan] || planColors.FREE)}>
                    {item.plan}
                  </Badge>
                  <span className="text-sm font-medium text-gray-700">{item.count} users</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Signups */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Signups</CardTitle>
            <Link href="/admin/users" className="text-sm text-indigo-600 hover:text-indigo-700">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : !stats?.recentSignups?.length ? (
              <p className="text-sm text-gray-500">No signups yet</p>
            ) : (
              <div className="space-y-3">
                {stats.recentSignups.slice(0, 5).map((user) => (
                  <Link
                    key={user.id}
                    href={`/admin/users/${user.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.image || undefined} />
                      <AvatarFallback className="text-xs">
                        {user.name ? getInitials(user.name) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.name || user.email}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <Badge className={cn('text-[10px]', planColors[user.plan] || planColors.FREE)}>
                      {user.plan}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Bookings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Bookings</CardTitle>
            <Link href="/admin/bookings" className="text-sm text-indigo-600 hover:text-indigo-700">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : !stats?.recentBookings?.length ? (
              <p className="text-sm text-gray-500">No bookings yet</p>
            ) : (
              <div className="space-y-3">
                {stats.recentBookings.slice(0, 5).map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {booking.eventType.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {booking.inviteeName} &middot; {booking.host.name || booking.host.email}
                      </p>
                    </div>
                    <Badge className={cn('text-[10px]', statusColors[booking.status] || statusColors.PENDING)}>
                      {booking.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
